import { callLLM } from "../../llm/client";
import { executeTool } from "../../mcp/executor";
import type { PDCAContext } from "../types";

/**
 * Planモード専用のシステムプロンプト
 */
const PLAN_SYSTEM_PROMPT = `
あなたは自律エージェントの「計画フェーズ」担当です。
目標達成のために必要な情報を調査し、実行可能なステップを構築してください。

1. 調査が必要な場合は、利用可能なMCPツールを積極的に使用してください。
2. 計画が十分に整ったら、"finish_plan" を呼び出して次のフェーズへ移行してください。
3. 常に現在のリソース（16GB vRAM）を意識し、効率的な手順を考えてください。
`;

/**
 * Planモード：現状を調査し、実行計画を構築する
 * 納得するまでMCP（目）を使い、準備ができたらDOへ遷移する
 */
export async function planMode(context: PDCAContext): Promise<PDCAContext> {
	const MAX_STEPS = 10; // 1モード内での最大試行回数

	while (context.stepCount < MAX_STEPS) {
		context.stepCount++;
		console.log(`  [Plan Step ${context.stepCount}] 思考中...`);

		// 1. LLMに現在の状況（Task + Summary + History）を渡して推論
		// ここで「調査が必要ならMCPを呼び、計画完了ならfinish_planを呼べ」と指示する
		const output = await callLLM(context, PLAN_SYSTEM_PROMPT);

		// 2. LLMの出力をhistoryに追加
		context.history.push({
			role: "thought",
			content: output.thought,
			ts: Date.now(),
		});

		// 3. LLMがツール（MCP）を呼び出した場合の処理
		if (output.toolCalls) {
			if (output.toolCalls.name === "finish_plan") {
				console.log("  [Plan] 計画が完了しました。実行フェーズへ移行します。");
				context.state = "DO";
				return context;
			}

			// MCP実行（目としての調査：ls, cat, read_fileなど）
			const result = await executeTool(output.toolCalls);
			context.history.push({
				role: "tool_result",
				content: JSON.stringify(result),
				ts: Date.now(),
			});
		}

		// 仮の終了条件（実装時はLLMの判断に委ねる）
		if (context.stepCount >= 1) {
			context.state = "DO";
			break;
		}
	}

	if (context.stepCount >= MAX_STEPS) {
		console.warn("  [Plan] ステップ上限に達したため、強制的に次へ遷移します。");
		context.state = "DO";
	}

	return context;
}
