import { callLLM } from "../../llm/client";
import { executeTool } from "../../mcp/executor";
import type { PDCAContext } from "../types";

/**
 * Doモード専用のシステムプロンプト
 */
const DO_SYSTEM_PROMPT = `
あなたは自律エージェントの「実行フェーズ」担当です。
Planモードで構築された手順に基づき、具体的な作業を遂行してください。

1. 外部環境への干渉（ファイルの作成・修正、コマンドの実行など）を迷わず行ってください。
2. 各ステップの実行結果を確認し、成功したかどうかを判断してください。
3. すべての作業が完了した、あるいは検証が必要な段階に達したら "finish_do" を呼び出してください。
4. 致命的なエラーや、前提条件の誤りに気づいた場合は、その理由を添えて "return_to_plan" を呼び出してください。
`;

export async function doMode(context: PDCAContext): Promise<PDCAContext> {
	const MAX_STEPS = 15; // 実行は手順が多くなるため少し長めに設定

	while (context.stepCount < MAX_STEPS) {
		context.stepCount++;
		console.log(`  [Do Step ${context.stepCount}] 作業実行中...`);

		const output = await callLLM(context, DO_SYSTEM_PROMPT);

		context.history.push({
			role: "thought",
			content: output.thought || "",
			ts: Date.now(),
		});

		if (output.toolCalls && output.toolCalls.length > 0) {
			for (const toolCall of output.toolCalls) {
				// 実行完了の合図
				if (toolCall.name === "finish_do") {
					console.log("  [Do] すべての作業を完了しました。検証フェーズへ移行します。");
					context.state = "CHECK";
					return context;
				}

				// 計画の見直しが必要な場合（動的遷移）
				if (toolCall.name === "return_to_plan") {
					console.warn("  [Do] 計画の不備を検知。Planモードへ戻ります。");
					context.state = "PLAN";
					return context;
				}

				// 実際のツール実行（write_file, exec_command等）
				const result = await executeTool(toolCall);
				context.history.push({
					role: "tool_result",
					content: JSON.stringify(result),
					ts: Date.now(),
				});
			}
		}
	}

	if (context.stepCount >= MAX_STEPS) {
		console.warn("  [Do] ステップ上限です。強制的に検証へ回します。");
		context.state = "CHECK";
	}

	return context;
}
