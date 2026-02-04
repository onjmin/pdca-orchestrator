import fs from "node:fs";
import path from "node:path";
import type { EffectDefinition, EffectResponse } from "../effects/types";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

// 抽象化されたエフェクト型
type AnyEffect = EffectDefinition<unknown, unknown>;

export const orchestrator = {
	// 最新のEffect execution結果を保持するバッファ
	// 識別子付き共用体を尊重し、初期値は null
	lastEffectResult: null as EffectResponse<unknown> | null,

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(registry: Record<string, AnyEffect>): Promise<string | null> {
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

		// 小人が次に何をするか選ぶフェーズ
		await savePromptLog("1-select-next", prompt);
		const rawContent = await llm.complete(prompt);

		if (!rawContent) {
			// ここで記録する！
			// 修正: success: false なので data ではなく error を指定
			this.recordObservation({
				success: false,
				summary: "Decision failed: LLM did not return any effect name.",
				error: "LLM_RESPONSE_EMPTY",
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
				error: `AVAILABLE_EFFECTS: ${Object.keys(registry).join(", ")}`,
			});
			return null;
		}

		return found;
	},

	/**
	 * 2. 選ばれたエフェクトを実行する（3ステップ構成）
	 */
	async dispatch(
		effect: AnyEffect,
		effectName: string,
		task: Task,
	): Promise<EffectResponse<unknown> | undefined> {
		// --- [STEP 2: Argument Generation] ---
		const schemaForLlm = JSON.parse(JSON.stringify(effect.inputSchema));
		let hasRawDataField = false;

		const props = schemaForLlm.properties || {};
		Object.keys(props).forEach((key) => {
			// description やフラグから __DATA__ フィールドの有無を確認
			if (props[key].isRawData || props[key].description?.includes("__DATA__")) {
				hasRawDataField = true;
				props[key].description = "!!! MANDATORY: Write ONLY the exact string '__DATA__' here. !!!";
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

		// 選んだツールの引数（__DATA__含み）を考えるフェーズ
		await savePromptLog("2-dispatch-args", argPrompt);
		const { data: args, error: jsonError } = await llm.completeAsJson(argPrompt);
		if (jsonError || !args || typeof args !== "object") {
			this.recordObservation({
				success: false,
				summary: "JSON argument generation failed.",
				error: jsonError || "INVALID_JSON_STRUCTURE",
			});
			return;
		}

		// --- [STEP 3: Raw Data Retrieval] ---
		const finalArgs: Record<string, unknown> = { ...(args as Record<string, unknown>) };

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

			// __DATA__ に流し込む中身（コード等）を考えるフェーズ
			await savePromptLog("3-dispatch-raw", rawPrompt);
			const rawContent = await llm.complete(rawPrompt);

			// 追加：生テキストが取得できなかった場合のガード
			if (!rawContent) {
				console.warn(`[Skip] Failed to get raw content for ${effectName}`);
				this.recordObservation({
					success: false,
					summary: `Failed to retrieve the raw content for field marked as __DATA__.`,
					error: "RAW_CONTENT_RETRIEVAL_FAILED",
				});
				return;
			}

			Object.keys(finalArgs).forEach((key) => {
				// string型であることを確認しつつ、前後の空白を除去して判定
				if (
					typeof finalArgs[key] === "string" &&
					(finalArgs[key] as string).trim() === "__DATA__"
				) {
					finalArgs[key] = rawContent;
				}
			});
		}

		// --- [Execution] ---
		try {
			console.log(`[Exec] Running ${effectName}...`);
			// handler(unknown) を呼び出し。内部の Zod がこの unknown をパースして守る
			const result = await effect.handler(finalArgs);
			this.recordObservation(result);
			return result;
		} catch (e: unknown) {
			// handlerが予期せぬエラーで落ちた場合もObservationとして記録
			const errorMessage = e instanceof Error ? e.message : String(e);
			const failResult: EffectResponse<never> = {
				success: false,
				summary: `Runtime error in ${effectName}`,
				error: errorMessage,
			};
			this.recordObservation(failResult);
			return failResult;
		}
	},

	/**
	 * 実行結果をバッファに記録
	 */
	recordObservation(result: EffectResponse<unknown>) {
		this.lastEffectResult = result;
	},
};

/**
 * デバッグ用：最新のプロンプトをファイルに上書き保存する
 */
async function savePromptLog(fileName: string, prompt: string) {
	if (process.env.DEBUG_PROMPT !== "1") return;

	const logDir = path.join(process.cwd(), "logs", "prompts");
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}

	// 常に同じファイル名で上書き
	await fs.promises.writeFile(path.join(logDir, `${fileName}.txt`), prompt, "utf8");
}
