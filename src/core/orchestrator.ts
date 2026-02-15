import { shellExecTool } from "../tools/shell/exec";
import type { ToolDefinition, ToolField, ToolResponse } from "../tools/types";
import { isDebugMode, savePromptLog } from "./debug-log";
import { llm, repairAndParseJSON } from "./llm-client";
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
	_predefinedArgs: null as Record<string, unknown> | null,

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

	// ツール実行直前に記録される引数
	lastToolParameters: null as Record<string, unknown> | null,

	/**
	 * 制御判断の状態をスナップショットとして記録する（思考フェーズ）
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
	 * 実際にツールに渡される引数を記録する（実行直前フェーズ）
	 */
	recordToolExecution(parameters: Record<string, unknown>) {
		this.lastToolParameters = parameters;
	},

	/**
	 * 内部（制御状態）と外部（Tool結果）を時系列順に統合した観測テキストを生成する
	 */
	getCombinedObservation(): string {
		const parts: string[] = [];

		// 1. まず「自分が何をしようとしたか（思考と引数）」を出す
		if (this.lastControlSnapshot) {
			const { chosenTool, rationale } = this.lastControlSnapshot;
			const params = this.lastToolParameters;

			let contextText = chosenTool
				? `Previous Action: "${chosenTool}"\nRationale: "${rationale}"`
				: "In the previous step, no action was taken.";

			if (params && Object.keys(params).length > 0) {
				contextText += `\nFinal Parameters: ${JSON.stringify(params)}`;
			}

			parts.push("### Internal Observation (Control Context)", contextText.trim(), "");
		}

		// 2. そのアクションに対する「結果」を最後に出す
		parts.push("### External Observation (Last Tool Result)");
		// lastToolResultがオブジェクトの場合は文字列化するなど、型に合わせて調整
		const resultText =
			typeof this.lastToolResult === "object"
				? JSON.stringify(this.lastToolResult, null, 2)
				: String(this.lastToolResult);

		parts.push(resultText);

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
        `.trim();

		const tools = Array.from(registry.entries())
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		const observationText = this.getCombinedObservation();

		// 💡 改善点: 推論プロセスを構造化し、DoDとの差分を意識させるプロンプトに変更
		const prompt = `
You are an autonomous agent operating under a strict logical framework.

### 🎯 Goal (Definition of Done)
${taskInfo}

### ✅ Completed Progress (Facts)
${historyText}

### 🛠 Available Tools
${tools}

### 🔍 Observation (The ONLY Source of Truth)
${observationText}

### 🧠 Required Reasoning Steps (Mandatory)
Before deciding on a tool, you MUST perform these steps internally:

1. **Confirmed World State**: Extract and list ONLY confirmed facts from the latest observation. (e.g., "File X exists", "Tests failed with Error Y"). Ignore assumptions.
2. **DoD Gap Evaluation**: Compare the World State against the DoD. List exactly which conditions are still "UNMET".
3. **Action Justification**:
   - If no "UNMET" conditions remain, you MUST choose \`task.check\`.
   - If a file already exists in the World State, you MUST NOT call \`file.create\`.
   - Distinguish between "Existence" and "Behavior" (Code existence does not mean it works).

### Instruction
${this.oneTimeInstruction || "Determine the next action based on the Gap Evaluation above."}

Respond in the following format:
Confirmed World State: (Facts from last observation)
DoD Gap Evaluation: (Unmet conditions)
Rationale: (Brief logic for tool choice and why it solves the gap)
Tool: (The exact tool name)
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

		// 3. 特殊なエイリアスや、古い名前/間違えやすい名前の最終救済
		if (!found || !registry.has(found)) {
			if (/container\.exec/.test(rawContent)) {
				found = shellExecTool.name;
			}
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

		// --- [追加] 連想配列（JSON）検知ロジック ---
		// 文字列の中に {...} が含まれているか探す
		const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

		if (jsonMatch && found) {
			// パースと正規化を試みる
			const { data: args, error: jsonError } = repairAndParseJSON(jsonMatch[0]);

			if (!jsonError && args && typeof args === "object") {
				const toolDef = registry.get(found);
				if (toolDef) {
					// LLM生成時のキー名の表記ゆれ（ケース違いや単語順序）を吸収し、スキーマ定義通りのキー名に正規化する。
					this._predefinedArgs = normalizeArgs(
						args as Record<string, unknown>,
						Object.keys(toolDef.inputSchema),
					);
				}
			}
			// 失敗時は _predefinedArgs が null のままなので、自然と STEP 2 へフォールバックされる
		}
		return registry.get(found) ?? null;
	},

	/**
	 * 2. 選ばれたツールを実行する
	 */
	async dispatch(tool: GenericTool, task: Task): Promise<ToolResponse<unknown> | undefined> {
		let argsToUse: Record<string, unknown>;

		// 1. 引数の確定 (STEP 2)
		if (this._predefinedArgs) {
			argsToUse = { ...this._predefinedArgs };
			this._predefinedArgs = null;
		} else {
			const generated = await this.generateArguments(tool, task);
			if (!generated) return;
			argsToUse = generated;
		}

		// 2. Raw Dataの補完 (STEP 3)
		const finalArgs = await this.retrieveRawData(tool, task, argsToUse);
		if (!finalArgs) return;

		// --- [Execution Pre-process] ---
		// プロンプト記録用に、巨大なフィールドだけを省略形に変換する
		const promptArgs: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(finalArgs)) {
			const fieldConfig = tool.inputSchema[key] as ToolField;

			if (fieldConfig?.isRawData && typeof value === "string") {
				// 巨大データなので切り詰める
				promptArgs[key] = truncateForPrompt(value, 100); // 100文字程度に制限
			} else {
				promptArgs[key] = value;
			}
		}

		this.recordToolExecution(promptArgs);

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

	/**
	 * [STEP 2] JSON引数の生成
	 */
	async generateArguments(tool: GenericTool, task: Task): Promise<Record<string, unknown> | null> {
		const observationText = this.getCombinedObservation();

		// プロンプト用のスキーマから isRawData フィールドを除外する
		const inputSchemaOmitted = Object.entries(tool.inputSchema).reduce(
			(acc, [key, field]) => {
				if (!(field as ToolField).isRawData) {
					acc[key] = field;
				}
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
			return null;
		}

		return normalizeArgs(args as Record<string, unknown>, Object.keys(tool.inputSchema));
	},

	/**
	 * [STEP 3] 特大データ（Raw Data）の取得とマージ
	 * すべての isRawData フィールドを順次取得し、引数にマージする
	 */
	async retrieveRawData(
		tool: GenericTool,
		task: Task,
		args: Record<string, unknown>,
	): Promise<Record<string, unknown> | null> {
		// すべての isRawData フィールドを抽出
		const rawDataFields = Object.entries(tool.inputSchema).filter(
			([_, f]) => (f as ToolField).isRawData,
		);

		// Raw Dataフィールドがなければそのまま返す
		if (rawDataFields.length === 0) return args;

		const observationText = this.getCombinedObservation();
		const currentArgs = { ...args };

		for (const [fieldName, fieldInfo] of rawDataFields) {
			// すでに引数に含まれている（selectNextToolで検知済み等）場合はスキップ
			if (currentArgs[fieldName]) continue;

			const rawPrompt = `
### Context
Task: ${task.title}
Executing Tool: ${tool.name}
Target Field: "${fieldName}" (${(fieldInfo as ToolField).description})
Other Arguments: ${JSON.stringify(currentArgs)}

### Observation (Previous Results & Your Internal Context)
${observationText}

### Instruction
Provide the ACTUAL content for the field "${fieldName}".
Refer to the Observation to ensure the content are appropriate for the current situation.
If this is code, provide the full source code.

### Rules
- NO Markdown code blocks.
- NO explanations.
- Output ONLY the raw content.
`.trim();

			await savePromptLog(`3-dispatch-raw-${fieldName}-input`, rawPrompt);
			const rawContent = await llm.complete(rawPrompt);
			await savePromptLog(`3-dispatch-raw-${fieldName}-output`, rawContent);

			if (!rawContent) {
				this.lastToolResult = {
					success: false,
					summary: `Failed to retrieve the raw content for field: ${fieldName}`,
					error: "RAW_CONTENT_RETRIEVAL_FAILED",
				};
				return null;
			}

			// 取得したコンテンツを次のループ（別のRawDataフィールド）のコンテキストにも使えるようマージ
			currentArgs[fieldName] = rawContent;
		}

		return currentArgs;
	},
};

/**
 * LLMが生成した引数のキー名を、スキーマで定義された正解のキー名に正規化する
 * 対応：キャメルケース、スネークケース、単語の順序逆転、大文字小文字の違い
 */
function normalizeArgs(
	rawArgs: Record<string, unknown>,
	schemaKeys: string[],
): Record<string, unknown> {
	const finalArgs: Record<string, unknown> = {};

	// 比較用：記号を消して小文字化
	const basic = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

	// 比較用：単語を分解してソート（順序逆転対策）
	const sorted = (s: string) => {
		return s
			.replace(/([A-Z])/g, "_$1") // キャメルケースをスネーク化
			.toLowerCase()
			.split(/[^a-z0-9]/) // 記号で分割
			.filter(Boolean)
			.sort()
			.join("");
	};

	for (const masterKey of schemaKeys) {
		// 1. 完全一致
		if (masterKey in rawArgs) {
			finalArgs[masterKey] = rawArgs[masterKey];
			continue;
		}

		const masterBasic = basic(masterKey);
		const masterSorted = sorted(masterKey);

		// 2. 候補を探す
		const foundKey = Object.keys(rawArgs).find((rawKey) => {
			const rBasic = basic(rawKey);
			if (rBasic === masterBasic) return true;

			const rSorted = sorted(rawKey);
			if (rSorted === masterSorted) return true;

			return false;
		});

		if (foundKey) {
			finalArgs[masterKey] = rawArgs[foundKey];
		}
	}

	return finalArgs;
}
