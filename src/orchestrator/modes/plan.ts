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

export async function planMode(context: PDCAContext): Promise<PDCAContext> {
	const MAX_STEPS = 10;

	while (context.stepCount < MAX_STEPS) {
		context.stepCount++;
		console.log(`  [Plan Step ${context.stepCount}] 思考中...`);

		// 1. LLMに推論を依頼
		const output = await callLLM(context, PLAN_SYSTEM_PROMPT);

		// 2. 思考プロセスを履歴に記録
		context.history.push({
			role: "thought",
			content: output.thought || "",
			ts: Date.now(),
		});

		// 3. ツール呼び出し（配列）の処理
		if (output.toolCalls && output.toolCalls.length > 0) {
			for (const toolCall of output.toolCalls) {
				// 計画完了フラグのチェック
				if (toolCall.name === "finish_plan") {
					console.log("  [Plan] 計画が完了しました。実行フェーズ(DO)へ移行します。");
					context.state = "DO";
					return context; // 即座に次のモードへ
				}

				// 通常のMCPツール実行
				console.log(`  [Plan] Tool Call: ${toolCall.name}`);
				const result = await executeTool(toolCall);

				context.history.push({
					role: "tool_result",
					content: JSON.stringify(result),
					ts: Date.now(),
				});
			}
		} else {
			// ツールが呼ばれなかった場合、LLMが言葉だけで「終わりました」と言っている可能性があるため
			// 安全策として一度ループを回すか、特定のフラグを見て判断します
			// 今回は自律性を重んじ、明示的なツール呼び出しがない限りは継続させます
		}

		// ステップごとの早期脱出（テスト用などで残す場合はここ）
		// if (context.stepCount >= 10) break;
	}

	if (context.stepCount >= MAX_STEPS) {
		console.warn("  [Plan] ステップ上限に達したため、強制的に次へ遷移します。");
		context.state = "DO";
	}

	return context;
}
