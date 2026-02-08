import fs from "node:fs";
import path from "node:path";
import type { EffectDefinition, EffectField, EffectResponse } from "../effects/types";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

// 外部から受け入れるための汎用型（anyの使用をここだけに限定する）
// 1. 各Effectの引数型が異なるため、unknownでは反変性の制約によりMapへの代入が不可能になる。
// 2. LLMが生成した動的なJSONを型安全の境界を越えて注入するため、意図的に型を消去している。
// biome-ignore lint/suspicious/noExplicitAny: カタログ形式での一括管理と実行時の動的注入を両立するための意図的な型消去
type GenericEffect = EffectDefinition<any, any>;

export const orchestrator = {
	lastControlSnapshot: null as ControlSnapshot | null,
	controlHistory: [] as ControlSnapshot[],

	/**
	 * 制御判断の状態をスナップショットとして記録する
	 */
	recordControlSnapshot(params: { chosenEffect: string | null; rationale: string }) {
		const snapshot: ControlSnapshot = {
			chosenEffect: params.chosenEffect,
			rationale: params.rationale,
			constraints: {}, // index.ts 側の updateLastSnapshotConstraints で後から補足される
		};

		this.lastControlSnapshot = snapshot;
		this.controlHistory.push(snapshot);
	},

	updateLastSnapshotConstraints(patch: Partial<ControlSnapshot["constraints"]>) {
		if (!this.lastControlSnapshot) return;

		this.lastControlSnapshot.constraints = {
			...this.lastControlSnapshot.constraints,
			...patch,
		};
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

		const raw = JSON.stringify(this._lastResult, null, 2);
		const limit = 2000;

		return raw.length > limit ? `${raw.substring(0, limit)}... (truncated)` : raw;
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

		const observationParts = [
			"### External Observation (Last Effect Result)",
			this.lastEffectResult,
		];

		if (this.lastControlSnapshot) {
			observationParts.push(
				"",
				"### Internal Observation (Control Snapshot)",
				snapshotToObservationText(this.lastControlSnapshot),
			);
		}

		const observationText = observationParts.join("\n");

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

		// Rationale と Effect 名を抽出
		const rationaleMatch = rawContent.match(/Rationale:\s*(.*)/i);
		const effectMatch = rawContent.match(/Effect:\s*(\w+)/i);

		const rationale = rationaleMatch ? rationaleMatch[1].trim() : "No reasoning provided.";
		const found = effectMatch
			? effectMatch[1].trim()
			: Array.from(registry.keys()).find((n) => rawContent.includes(n));

		if (!found) {
			this.lastEffectResult = {
				success: false,
				summary: `Decision failed: Selected effect "${rawContent.substring(0, 50)}" is not available.`,
				error: `AVAILABLE_EFFECTS: ${Array.from(registry.keys()).join(", ")}`,
			};
			return null;
		}

		this.recordControlSnapshot({
			phase: "select",
			taskTitle: currentTask.title,
			chosenEffect: found ?? null,
			rationale: rationale,
			decisionSource: "model",
		});

		return registry.get(found) ?? null;
	},

	/**
	 * 2. 選ばれたエフェクトを実行する（3ステップ構成）
	 */
	async dispatch(effect: GenericEffect, task: Task): Promise<EffectResponse<unknown> | undefined> {
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
Executing Tool: ${effect.name}
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

type ControlSnapshot = {
	chosenEffect: string | null;
	rationale: string;
	constraints: {
		stagnationCount?: number;
		sameEffectCount?: number;
	};
};

function snapshotToObservationText(s: ControlSnapshot): string {
	if (!s.chosenEffect) {
		return "In the previous step, no action was taken.";
	}

	// 停滞状況をシンプルに言語化
	const isStagnating = (s.constraints.stagnationCount ?? 0) > 0;
	const stagnationWarning = isStagnating
		? `\n[Warning] This approach has not progressed for ${s.constraints.stagnationCount} steps.`
		: "";

	return `
Your previous action: "${s.chosenEffect}"
Your previous rationale: "${s.rationale}"
${stagnationWarning}
`.trim();
}
