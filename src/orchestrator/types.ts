import type { LLMOutput } from "../llm/schema";
import type { ToolResult } from "../mcp/schema";

export type PDCAState = "PLAN" | "DO" | "CHECK" | "ACT" | "FINISHED";

export type Task = {
	id: string;
	prompt: string;
	done?: boolean;
};

/**
 * モード内でのやり取りの記録
 */
export type HistoryItem = {
	role: "thought" | "tool_call" | "tool_result" | "summary";
	content: string;
	ts: number;
};

export type PDCAContext = {
	task: Task;
	state: PDCAState;

	/** 現在のモード内で蓄積されている生ログ（Actでクリアされる） */
	history: HistoryItem[];

	/** * Actモードで生成された、これまでの全サイクルの「圧縮された記憶」
	 * 次のサイクルのPlan時にLLMに渡す
	 */
	summary: string;

	/** 直近のLLM出力とツール実行結果 */
	llmOutput?: LLMOutput;
	toolResult?: ToolResult;

	/** タスクが完全に完了したかどうかの判定フラグ */
	isGoalReached: boolean;

	/** 全体の周回数（無限ループ防止や、Actでのログ記録に使用） */
	cycleCount: number;

	/** モード内での試行回数（膠着状態の検知に使用） */
	stepCount: number;
};
