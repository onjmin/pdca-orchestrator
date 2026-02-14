import type { ToolDefinition, ToolField, ToolResponse } from "../tools/types";
import { isDebugMode, savePromptLog } from "./debug-log";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";
import { truncateForPrompt } from "./utils";

// 外部から受け入れるための汎用型（anyの使用をここだけに限定する）
// 1. 各Toolの引数型が異なるため、unknownでは反変性の制約によりMapへの代入が不可能になる。
// 2. LLMが生成した動的なJSONを型安全の境界を越えて注入するため、意図的に型を消去している。
// biome-ignore lint/suspicious/noExplicitAny: カタログ形式での一括管理と実行時の動的注入を両立するための意図的な型消去
type GenericTool = ToolDefinition<any, any>;

type ControlSnapshot = {
	chosenTool: string | null;
	rationale: string;
};

export const orchestrator = {
	_oneTimeInstruction: null as string | null,

	/**
	 * 1ターン限定の特別指示をセットする
	 */
	get oneTimeInstruction() {
		return this._oneTimeInstruction
			? `### Special Instruction (Priority)\n**${this._oneTimeInstruction}**\n`
			: "";
	},

	set oneTimeInstruction(instruction: string) {
		this._oneTimeInstruction = instruction;
	},

	lastControlSnapshot: null as ControlSnapshot | null,
	controlHistory: [] as ControlSnapshot[],

	/**
	 * 制御判断の状態をスナップショットとして記録する
	 */
	recordControlSnapshot(params: { chosenTool: string | null; rationale: string }) {
		const snapshot: ControlSnapshot = {
			chosenTool: params.chosenTool,
			rationale: params.rationale,
		};

		this.lastControlSnapshot = snapshot;
		this.controlHistory.push(snapshot);
	},

	/**
	 * 外部（Tool結果）と内部（制御状態）の両方を統合した観測テキストを生成する
	 */
	getCombinedObservation(): string {
		const parts = ["### External Observation (Last Tool Result)", this.lastToolResult];

		const { lastControlSnapshot } = this;

		if (this.lastControlSnapshot) {
			parts.push(
				"",
				"### Internal Observation (Control Context)",
				lastControlSnapshot?.chosenTool
					? `
Your previous action: "${lastControlSnapshot.chosenTool}"
Your previous rationale: "${lastControlSnapshot.rationale}"
`.trim()
					: "In the previous step, no action was taken.",
			);
		}

		return parts.join("\n");
	},

	// 最新のTool execution結果を保持するバッファ
	_lastResult: null as ToolResponse<unknown> | null,

	/**
	 * 最新の実行結果をセットする (setter)
	 */
	set lastToolResult(result: ToolResponse<unknown> | null) {
		this._lastResult = result;
	},

	/**
	 * プロンプト用に成形された観測結果（文字列）を取得する (getter)
	 */
	get lastToolResult(): string {
		if (!this._lastResult) return "No previous action.";

		return truncateForPrompt(JSON.stringify(this._lastResult, null, 2), 2000);
	},

	/**
	 * 1. 次に実行すべきツールを1つ選ぶ（選択のみ）
	 */
	async selectNextTool(registry: Map<string, GenericTool>): Promise<GenericTool | null> {
		const stack = taskStack.getStack();
		if (stack.length === 0) return null;

		const currentTask = stack[stack.length - 1];

		// --- 履歴の成形 ---
		const historyText =
			currentTask.completedSubTasks && currentTask.completedSubTasks.length > 0
				? currentTask.completedSubTasks.map((t) => `- [COMPLETED] ${t.title}: ${t.dod}`).join("\n")
				: "No sub-tasks completed yet.";

		const taskInfo = `
Current Task: ${currentTask.title}
Description: ${currentTask.description}
DoD: ${currentTask.dod}
Strategy: ${currentTask.strategy || "None (Need to plan?)"}
Reasoning: ${currentTask.reasoning || "None"}

### Completed Progress
${historyText}
        `.trim();

		const tools = Array.from(registry.entries())
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		const observationText = this.getCombinedObservation();

		const prompt = `
You are an autonomous agent.

### Goal and Strategy
${taskInfo}

### Available Tools
${tools}

### Observation
${observationText}

### Instruction
Based on the current task, strategy, and observation, which tool should you execute next?
${this.oneTimeInstruction}

Respond in the following format:
Rationale: (Your brief reasoning for this choice)
Tool: (The exact tool name from the list above)
        `.trim();

		console.log(`[Brain] Choosing next step for: ${currentTask.title}`);

		await savePromptLog("1-select-next-input", prompt);
		const rawContent = await llm.complete(prompt);
		await savePromptLog("1-select-next-output", rawContent);

		if (!rawContent) {
			this.lastToolResult = {
				success: false,
				summary: "Decision failed: LLM did not return any tool name.",
				error: "LLM_RESPONSE_EMPTY",
			};
			return null;
		}

		// Rationale: の行を抽出
		const rationaleMatch = rawContent.match(/Rationale:\s*(.*)/i);
		const rationale = rationaleMatch ? rationaleMatch[1].trim() : "No reasoning provided.";

		// Tool: の行から、registryにある名前を正確に探す
		const toolNames = Array.from(registry.keys());

		// 1. まず "Tool: 名前" の形式で探す（大文字小文字無視、ハイフン等も許容）
		const toolLineMatch = rawContent.match(/Tool:\s*([a-zA-Z0-9_-]+)/i);
		let found = toolLineMatch ? toolLineMatch[1].trim() : null;

		// 2. もし見つからなかった、または registry にない名前だった場合、
		// 全文から registry にある名前を完全一致で探す
		if (!found || !registry.has(found)) {
			found =
				toolNames.find((name) => {
					// 単語境界 (\b) を使って、他の単語の一部として含まれている場合は無視する
					const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					return new RegExp(`\\b${escapedName}\\b`, "i").test(rawContent);
				}) ?? null;
		}

		if (!found || !registry.has(found)) {
			this.lastToolResult = {
				success: false,
				summary: `Decision failed: Selected tool "${found || "unknown"}" is not available.`,
				error: `AVAILABLE_TOOLS: ${toolNames.join(", ")}`,
			};
			return null;
		}

		// Snapshot の記録（引数を整理した最新の型に合わせる）
		this.recordControlSnapshot({
			chosenTool: found,
			rationale: rationale,
		});

		if (isDebugMode) {
			console.log({
				chosenTool: found,
				rationale: rationale,
			});
		}

		return registry.get(found) ?? null;
	},

	/**
	 * 2. 選ばれたツールを実行する
	 */
	async dispatch(tool: GenericTool, task: Task): Promise<ToolResponse<unknown> | undefined> {
		const observationText = this.getCombinedObservation();

		// --- [STEP 2: Argument Generation] ---

		let rawDataFieldName = "";
		const inputSchemaOmitted = (Object.entries(tool.inputSchema) as [string, ToolField][]).reduce(
			(acc, [key, field]) => {
				if (field.isRawData) {
					if (rawDataFieldName) {
						console.warn(
							`[Orchestrator] Warning: Multiple isRawData fields found in "${tool.name}". Only "${rawDataFieldName}" will be used. Field "${key}" will be ignored.`,
						);
					} else {
						rawDataFieldName = key;
					}
					return acc;
				}
				acc[key] = field;
				return acc;
			},
			{} as Record<string, ToolField>,
		);

		const argPrompt = `
You are using the tool: "${tool.name}"
Description: ${tool.description}

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

		await savePromptLog("2-dispatch-args-input", argPrompt);
		const { data: args, error: jsonError } = await llm.completeAsJson(argPrompt);
		await savePromptLog("2-dispatch-args-output", JSON.stringify(args));
		if (jsonError || !args || typeof args !== "object") {
			this.lastToolResult = {
				success: false,
				summary: "JSON argument generation failed.",
				error: jsonError || "INVALID_JSON_STRUCTURE",
			};
			return;
		}

		// --- [STEP 3: Raw Data Retrieval] ---
		const finalArgs: Record<string, unknown> = { ...(args as Record<string, unknown>) };

		if (rawDataFieldName) {
			const fieldInfo = tool.inputSchema[rawDataFieldName as keyof unknown];
			const rawPrompt = `
### Context
Task: ${task.title}
Executing Tool: ${tool.name}
Target Field: "${rawDataFieldName}" (${(fieldInfo as ToolField).description})
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

			await savePromptLog("3-dispatch-raw-input", rawPrompt);
			const rawContent = await llm.complete(rawPrompt);
			await savePromptLog("3-dispatch-raw-output", rawContent);

			if (!rawContent) {
				this.lastToolResult = {
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
			console.log(`[Exec] Running ${tool.name}...`);
			const result = await tool.handler(finalArgs);
			this.lastToolResult = result;
			return result;
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			const failResult: ToolResponse<never> = {
				success: false,
				summary: `Runtime error in ${tool.name}`,
				error: errorMessage,
			};
			this.lastToolResult = failResult;
			return failResult;
		}
	},
};
