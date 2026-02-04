import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

export const orchestrator = {
	// 最新のEffect実行結果を保持するバッファ
	lastEffectResult: null as any,

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(registry: Record<string, any>): Promise<string | null> {
		const stack = taskStack.getStack();
		if (stack.length === 0) return "";

		const currentTask = stack[stack.length - 1];

		// 1. インメモリ情報の取り出し（不変の目標）
		const taskInfo = `
Current Task: ${currentTask.title}
Description: ${currentTask.description}
DoD: ${currentTask.dod}
Strategy: ${currentTask.strategy || "None (Need to plan?)"}
Reasoning: ${currentTask.reasoning || "None"}
        `.trim();

		// 2. ツール一覧の整形（選択肢）
		const tools = Object.entries(registry)
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		// 3. 直近の実行結果（流動的なデータ）
		// 巨大すぎるデータはここでカットして影響を最小限にする
		const rawObservation = this.lastEffectResult
			? JSON.stringify(this.lastEffectResult, null, 2)
			: "No previous action.";
		const observation =
			rawObservation.length > 2000
				? `${rawObservation.substring(0, 2000)}... (truncated)"`
				: rawObservation;

		// 4. 最終的なプロンプト構成
		const prompt = `
You are an autonomous agent.

### Goal and Strategy
${taskInfo}

### Available Effects
${tools}

### Observation from Previous Step
${observation}

### Instruction
Based on the current task, strategy, and observation, which effect should you execute next? 
Respond with only the effect name.
        `.trim();

		console.log(`[Brain] Choosing next step for: ${currentTask.title}`);

		// completeAsJson ではなく、生のテキストを返す complete を使う
		const rawContent = await llm.complete(prompt);

		if (!rawContent) {
			// ここで記録する！
			this.recordObservation({
				success: false,
				summary: "Decision failed: LLM did not return any effect name.",
				data: { action: "Waiting for retry or check status." },
			});
			return null;
		}

		// LLMが「Next effect: task.plan」のように喋ってしまった場合を考慮し、
		// 登録されているエフェクト名が文字列の中に含まれているか探す
		const found = Object.keys(registry).find((name) => rawContent.includes(name));

		if (!found) {
			// 「何か喋ったけど、存在するツール名じゃなかった」場合も記録
			this.recordObservation({
				success: false,
				summary: `Decision failed: Selected effect "${rawContent.substring(0, 50)}" is not available.`,
				data: { available: Object.keys(registry) },
			});
			return null;
		}

		return found;
	},

	/**
	 * 2. 選ばれたエフェクトを実行する（3ステップ構成）
	 */
	async dispatch(effect: any, effectName: string, task: Task): Promise<any> {
		// --- [STEP 2: Argument Generation] ---
		const schemaForLlm = JSON.parse(JSON.stringify(effect.inputSchema));
		let hasRawDataField = false;

		Object.keys(schemaForLlm.properties || {}).forEach((key) => {
			if (effect.inputSchema.properties[key].isRawData) {
				hasRawDataField = true;
				schemaForLlm.properties[key].description =
					"!!! MANDATORY: Write ONLY the exact string '__DATA__' here. !!!";
			}
		});

		const argPrompt = `
You are using the tool: "${effectName}"
Description: ${effect.description}

### Task Context
Task: ${task.title}
DoD: ${task.dod}

### Observation from Previous Step
${JSON.stringify(this.lastEffectResult || "No previous action.", null, 2)}

### Required JSON Schema
${JSON.stringify(schemaForLlm, null, 2)}

### Instruction
Generate JSON arguments. Use "__DATA__" where required.
Respond with ONLY the JSON object.
`.trim();

		const { data: args, error } = await llm.completeAsJson(argPrompt);
		if (error || !args) {
			this.recordObservation({ success: false, summary: "JSON argument generation failed." });
			return;
		}

		// --- [STEP 3: Raw Data Retrieval] ---
		const finalArgs: Record<string, any> = { ...args };

		if (hasRawDataField) {
			// ここで背景情報をしっかり渡す
			const rawPrompt = `
### Context
Task: ${task.title}
Executing Tool: ${effectName}
Partial Arguments: ${JSON.stringify(args)}

### Instruction
Provide the ACTUAL content to replace "__DATA__". 
For example, if this is a file write, provide the source code now.

### Rules
- NO Markdown code blocks.
- NO explanations.
- Output ONLY the raw content.
`.trim();

			const rawContent = await llm.complete(rawPrompt);

			// 追加：生テキストが取得できなかった場合のガード
			if (!rawContent) {
				console.warn(`[Skip] Failed to get raw content for ${effectName}`);
				this.recordObservation({
					success: false,
					summary: `Failed to retrieve the raw content for field marked as __DATA__.`,
				});
				return;
			}

			Object.keys(finalArgs).forEach((key) => {
				// string型であることを確認しつつ、前後の空白を除去して判定
				if (typeof finalArgs[key] === "string" && finalArgs[key].trim() === "__DATA__") {
					finalArgs[key] = rawContent;
				}
			});
		}

		// --- [Execution] ---
		try {
			console.log(`[Exec] Running ${effectName}...`);
			const result = await effect.handler(finalArgs);
			this.recordObservation({
				effectName,
				summary: result.summary,
				data: result.data,
				success: result.success,
			});
			return result;
		} catch (e: any) {
			// handlerが予期せぬエラーで落ちた場合もObservationとして記録
			this.recordObservation({
				success: false,
				summary: `Runtime error in ${effectName}: ${e.message}`,
				effectName,
			});
			return;
		}
	},

	recordObservation(result: any) {
		this.lastEffectResult = result;
	},
};
