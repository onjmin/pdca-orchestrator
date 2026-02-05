import fs from "node:fs";
import path from "node:path";
import type { EffectDefinition, EffectField, EffectResponse } from "../effects/types";
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

		// RawData フィールドの特定と軽量版スキーマの生成
		let rawDataFieldName = "";
		const inputSchemaOmitted = (
			Object.entries(effect.inputSchema) as [string, EffectField][]
		).reduce(
			(acc, [key, field]) => {
				// 1. RawData の場合: スキーマからは必ず除外
				if (field.isRawData) {
					if (rawDataFieldName) {
						console.warn(
							`[Orchestrator] Warning: Multiple isRawData fields found in "${effectName}". Only "${rawDataFieldName}" will be used. Field "${key}" will be ignored.`,
						);
					} else {
						rawDataFieldName = key;
					}
					return acc; // acc に追加せず次のループへ
				}

				// 2. 通常フィールドの場合: スキーマに追加
				acc[key] = field;
				return acc;
			},
			{} as Record<string, EffectField>,
		);

		const argPrompt = `
You are using the tool: "${effectName}"
Description: ${effect.description}

### Task Context
Task: ${task.title}
DoD: ${task.dod}

### Observation from Previous Step
${JSON.stringify(this.lastEffectResult || "No previous action.", null, 2)}

### Required JSON Schema
${JSON.stringify(inputSchemaOmitted, null, 2)}

### Instruction
Generate JSON arguments for the fields defined in the schema.
Respond with ONLY the JSON object.
`.trim();

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

		if (rawDataFieldName) {
			const fieldInfo = effect.inputSchema[rawDataFieldName as keyof unknown];
			const rawPrompt = `
### Context
Task: ${task.title}
Executing Tool: ${effectName}
Target Field: "${rawDataFieldName}" (${(fieldInfo as EffectField).description})
Other Arguments: ${JSON.stringify(args)}

### Instruction
Provide the ACTUAL content for the field "${rawDataFieldName}".
If this is code, provide the full source code.

### Rules
- NO Markdown code blocks.
- NO explanations.
- Output ONLY the raw content.
`.trim();

			await savePromptLog("3-dispatch-raw", rawPrompt);
			const rawContent = await llm.complete(rawPrompt);

			if (!rawContent) {
				this.recordObservation({
					success: false,
					summary: `Failed to retrieve the raw content for field: ${rawDataFieldName}`,
					error: "RAW_CONTENT_RETRIEVAL_FAILED",
				});
				return;
			}

			// 特定したフィールド名に生データを直接代入
			finalArgs[rawDataFieldName] = rawContent;
		}

		// --- [Execution] ---
		try {
			console.log(`[Exec] Running ${effectName}...`);
			const result = await effect.handler(finalArgs);
			this.recordObservation(result);
			return result;
		} catch (e: unknown) {
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
