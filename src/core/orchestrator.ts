import fs from "node:fs";
import path from "node:path";
import type { EffectDefinition, EffectField, EffectResponse } from "../effects/types";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";
import { truncate } from "./utils";

// 外部から受け入れるための汎用型（anyの使用をここだけに限定する）
// 1. 各Effectの引数型が異なるため、unknownでは反変性の制約によりMapへの代入が不可能になる。
// 2. LLMが生成した動的なJSONを型安全の境界を越えて注入するため、意図的に型を消去している。
// biome-ignore lint/suspicious/noExplicitAny: カタログ形式での一括管理と実行時の動的注入を両立するための意図的な型消去
type GenericEffect = EffectDefinition<any, any>;

type ControlSnapshot = {
	chosenEffect: string | null;
	rationale: string;
};

export const orchestrator = {
	_oneTimeInstruction: null as string | null,

	/**
	 * 1ターン限定の特別指示をセットする
	 */
	get oneTimeInstruction() {
		return this.oneTimeInstruction
			? `### Special Instruction (Priority)\n**${this.oneTimeInstruction}**\n`
			: "";
	},

	set oneTimeInstruction(instruction: string) {
		this.oneTimeInstruction = instruction;
	},

	lastControlSnapshot: null as ControlSnapshot | null,
	controlHistory: [] as ControlSnapshot[],

	/**
	 * 制御判断の状態をスナップショットとして記録する
	 */
	recordControlSnapshot(params: { chosenEffect: string | null; rationale: string }) {
		const snapshot: ControlSnapshot = {
			chosenEffect: params.chosenEffect,
			rationale: params.rationale,
		};

		this.lastControlSnapshot = snapshot;
		this.controlHistory.push(snapshot);
	},

	/**
	 * 外部（Effect結果）と内部（制御状態）の両方を統合した観測テキストを生成する
	 */
	getCombinedObservation(): string {
		const parts = ["### External Observation (Last Effect Result)", this.lastEffectResult];

		const { lastControlSnapshot } = this;

		if (this.lastControlSnapshot) {
			parts.push(
				"",
				"### Internal Observation (Control Context)",
				lastControlSnapshot?.chosenEffect
					? `
Your previous action: "${lastControlSnapshot.chosenEffect}"
Your previous rationale: "${lastControlSnapshot.rationale}"
`.trim()
					: "In the previous step, no action was taken.",
			);
		}

		return parts.join("\n");
	},

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

		return truncate(JSON.stringify(this._lastResult, null, 2), 2000);
	},

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(registry: Map<string, GenericEffect>): Promise<GenericEffect | null> {
		const stack = taskStack.getStack();
		if (stack.length === 0) return null;

		const currentTask = stack[stack.length - 1];

		const taskInfo = `
Current Task: ${currentTask.title}
Description: ${currentTask.description}
DoD: ${currentTask.dod}
Strategy: ${currentTask.strategy || "None (Need to plan?)"}
Reasoning: ${currentTask.reasoning || "None"}
        `.trim();

		const tools = Array.from(registry.entries())
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		const observationText = this.getCombinedObservation();

		const prompt = `
You are an autonomous agent.

### Goal and Strategy
${taskInfo}

### Available Effects
${tools}

### Observation
${observationText}

### Instruction
Based on the current task, strategy, and observation, which effect should you execute next?
${this.oneTimeInstruction}

Respond in the following format:
Rationale: (Your brief reasoning for this choice)
Effect: (The exact effect name from the list above)
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

		// Rationale: の行を抽出
		const rationaleMatch = rawContent.match(/Rationale:\s*(.*)/i);
		const rationale = rationaleMatch ? rationaleMatch[1].trim() : "No reasoning provided.";

		// Effect: の行から、registryにある名前を正確に探す
		const effectNames = Array.from(registry.keys());

		// 1. まず "Effect: 名前" の形式で探す（大文字小文字無視、ハイフン等も許容）
		const effectLineMatch = rawContent.match(/Effect:\s*([a-zA-Z0-9_-]+)/i);
		let found = effectLineMatch ? effectLineMatch[1].trim() : null;

		// 2. もし見つからなかった、または registry にない名前だった場合、
		// 全文から registry にある名前を完全一致で探す
		if (!found || !registry.has(found)) {
			found =
				effectNames.find((name) => {
					// 単語境界 (\b) を使って、他の単語の一部として含まれている場合は無視する
					const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					return new RegExp(`\\b${escapedName}\\b`, "i").test(rawContent);
				}) ?? null;
		}

		if (!found || !registry.has(found)) {
			this.lastEffectResult = {
				success: false,
				summary: `Decision failed: Selected effect "${found || "unknown"}" is not available.`,
				error: `AVAILABLE_EFFECTS: ${effectNames.join(", ")}`,
			};
			return null;
		}

		// Snapshot の記録（引数を整理した最新の型に合わせる）
		this.recordControlSnapshot({
			chosenEffect: found,
			rationale: rationale,
		});

		if (process.env.DEBUG_MODE === "1") {
			console.log({
				chosenEffect: found,
				rationale: rationale,
			});
		}

		return registry.get(found) ?? null;
	},

	/**
	 * 2. 選ばれたエフェクトを実行する
	 */
	async dispatch(effect: GenericEffect, task: Task): Promise<EffectResponse<unknown> | undefined> {
		const observationText = this.getCombinedObservation();

		// --- [STEP 2: Argument Generation] ---

		let rawDataFieldName = "";
		const inputSchemaOmitted = (
			Object.entries(effect.inputSchema) as [string, EffectField][]
		).reduce(
			(acc, [key, field]) => {
				if (field.isRawData) {
					if (rawDataFieldName) {
						console.warn(
							`[Orchestrator] Warning: Multiple isRawData fields found in "${effect.name}". Only "${rawDataFieldName}" will be used. Field "${key}" will be ignored.`,
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
You are using the tool: "${effect.name}"
Description: ${effect.description}

### Task Context
Task: ${task.title}
DoD: ${task.dod}

### Observation (Previous Results & Your Internal Context)
${observationText}

### Notice
Some fields (e.g., large data content) are omitted from this schema and will be requested in the FOLLOW-UP step. 
Do NOT try to include them here.

### Required JSON Schema
${JSON.stringify(inputSchemaOmitted, null, 2)}

### Instruction
Generate JSON arguments for the fields. 
Refer to the Observation to ensure the arguments are appropriate for the current situation.
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
Executing Tool: ${effect.name}
Target Field: "${rawDataFieldName}" (${(fieldInfo as EffectField).description})
Other Arguments: ${JSON.stringify(args)}

### Observation (Previous Results & Your Internal Context)
${observationText}

### Instruction
Provide the ACTUAL content for the field "${rawDataFieldName}".
Refer to the Observation to ensure the content are appropriate for the current situation.
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
			console.log(`[Exec] Running ${effect.name}...`);
			const result = await effect.handler(finalArgs);
			this.lastEffectResult = result;
			return result;
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			const failResult: EffectResponse<never> = {
				success: false,
				summary: `Runtime error in ${effect.name}`,
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
