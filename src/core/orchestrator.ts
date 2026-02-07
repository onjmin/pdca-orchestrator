import fs from "node:fs";
import path from "node:path";
import type { EffectDefinition, EffectField, EffectResponse } from "../effects/types";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

// 抽象化されたエフェクト型
type AnyEffect = EffectDefinition<unknown, unknown>;

export const orchestrator = {
	// 最新のEffect execution結果を保持するバッファ
	_lastResult: null as EffectResponse<unknown> | null,

	/**
	 * 最新の実行結果をセットする (setter)
	 */
	set lastEffectResult(result: EffectResponse<unknown> | null) {
		this._lastResult = result;
	},

	/**
	 * プロンプト用に成形された観測結果（文字列）を取得する (getter)
	 */
	get lastEffectResult(): string {
		if (!this._lastResult) return "No previous action.";

		const raw = JSON.stringify(this._lastResult, null, 2);
		const limit = 2000;

		return raw.length > limit ? `${raw.substring(0, limit)}... (truncated)` : raw;
	},

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(registry: Record<string, AnyEffect>): Promise<string | null> {
		const stack = taskStack.getStack();
		if (stack.length === 0) return "";

		const currentTask = stack[stack.length - 1];

		const taskInfo = `
Current Task: ${currentTask.title}
Description: ${currentTask.description}
DoD: ${currentTask.dod}
Strategy: ${currentTask.strategy || "None (Need to plan?)"}
Reasoning: ${currentTask.reasoning || "None"}
        `.trim();

		const tools = Object.entries(registry)
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		const prompt = `
You are an autonomous agent.

### Goal and Strategy
${taskInfo}

### Available Effects
${tools}

### Observation from Previous Step
${this.lastEffectResult}

### Instruction
Based on the current task, strategy, and observation, which effect should you execute next? 
Respond with only the effect name.
        `.trim();

		console.log(`[Brain] Choosing next step for: ${currentTask.title}`);

		await savePromptLog("1-select-next", prompt);
		const rawContent = await llm.complete(prompt);

		if (!rawContent) {
			this.lastEffectResult = {
				success: false,
				summary: "Decision failed: LLM did not return any effect name.",
				error: "LLM_RESPONSE_EMPTY",
			};
			return null;
		}

		const found = Object.keys(registry).find((name) => rawContent.includes(name));

		if (!found) {
			this.lastEffectResult = {
				success: false,
				summary: `Decision failed: Selected effect "${rawContent.substring(0, 50)}" is not available.`,
				error: `AVAILABLE_EFFECTS: ${Object.keys(registry).join(", ")}`,
			};
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

		let rawDataFieldName = "";
		const inputSchemaOmitted = (
			Object.entries(effect.inputSchema) as [string, EffectField][]
		).reduce(
			(acc, [key, field]) => {
				if (field.isRawData) {
					if (rawDataFieldName) {
						console.warn(
							`[Orchestrator] Warning: Multiple isRawData fields found in "${effectName}". Only "${rawDataFieldName}" will be used. Field "${key}" will be ignored.`,
						);
					} else {
						rawDataFieldName = key;
					}
					return acc;
				}
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
${this.lastEffectResult}

### Notice
Some fields (e.g., large data content) are omitted from this schema and will be requested in the FOLLOW-UP step. 
Do NOT try to include them here.

### Required JSON Schema
${JSON.stringify(inputSchemaOmitted, null, 2)}

### Instruction
Generate JSON arguments for the fields defined in the schema.
Respond with ONLY the JSON object.
`.trim();

		await savePromptLog("2-dispatch-args", argPrompt);
		const { data: args, error: jsonError } = await llm.completeAsJson(argPrompt);
		if (jsonError || !args || typeof args !== "object") {
			this.lastEffectResult = {
				success: false,
				summary: "JSON argument generation failed.",
				error: jsonError || "INVALID_JSON_STRUCTURE",
			};
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
Latest Observation: ${this.lastEffectResult}

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
				this.lastEffectResult = {
					success: false,
					summary: `Failed to retrieve the raw content for field: ${rawDataFieldName}`,
					error: "RAW_CONTENT_RETRIEVAL_FAILED",
				};
				return;
			}

			finalArgs[rawDataFieldName] = rawContent;
		}

		// --- [Execution] ---
		try {
			console.log(`[Exec] Running ${effectName}...`);
			const result = await effect.handler(finalArgs);
			this.lastEffectResult = result;
			return result;
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			const failResult: EffectResponse<never> = {
				success: false,
				summary: `Runtime error in ${effectName}`,
				error: errorMessage,
			};
			this.lastEffectResult = failResult;
			return failResult;
		}
	},
};

/**
 * デバッグ用：最新のプロンプトをファイルに上書き保存する
 */
async function savePromptLog(fileName: string, prompt: string) {
	if (process.env.DEBUG_MODE !== "1") return;

	const logDir = path.join(process.cwd(), "logs", "prompts");
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}

	await fs.promises.writeFile(path.join(logDir, `${fileName}.txt`), prompt, "utf8");
}
