import { callLLM } from "../../llm/client";
import { executeTool } from "../../mcp/executor";
import type { PDCAContext } from "../types";

/**
 * Checkモード専用のシステムプロンプト
 */
const CHECK_SYSTEM_PROMPT = `
あなたは自律エージェントの「検証フェーズ」担当です。
Doモードでの作業結果が、当初のタスク要求を完全に満たしているか厳格に評価してください。

1. 可能であれば、実際にファイルの中身を確認したり、テストコマンドを実行したりして結果を裏取ってください。
2. もし修正が不十分、あるいは新たなバグを発見した場合は、修正指示を添えて "return_to_do" を呼び出してください。
3. 計画自体に無理があったと判断した場合は "return_to_plan" を呼び出してください。
4. すべてが完璧であれば "finish_check" を呼び出し、目標達成を宣言してください。
`;

export async function checkMode(context: PDCAContext): Promise<PDCAContext> {
	const MAX_STEPS = 8; // 検証は要点を絞って行うため、やや少なめに設定

	while (context.stepCount < MAX_STEPS) {
		context.stepCount++;
		console.log(`  [Check Step ${context.stepCount}] 検証中...`);

		const output = await callLLM(context, CHECK_SYSTEM_PROMPT);

		context.history.push({
			role: "thought",
			content: output.thought || "",
			ts: Date.now(),
		});

		if (output.toolCalls && output.toolCalls.length > 0) {
			for (const toolCall of output.toolCalls) {
				// 検証成功：Act（要約・定着）へ
				if (toolCall.name === "finish_check") {
					console.log("  [Check] 検証完了。目標は達成されました。");
					context.isGoalReached = true;
					context.state = "ACT";
					return context;
				}

				// 修正が必要：Doへ差し戻し
				if (toolCall.name === "return_to_do") {
					console.warn("  [Check] 不備を発見。再実行フェーズへ戻ります。");
					context.state = "DO";
					return context;
				}

				// 設計から見直し：Planへ差し戻し
				if (toolCall.name === "return_to_plan") {
					console.warn("  [Check] 根本的な問題を発見。再計画へ戻ります。");
					context.state = "PLAN";
					return context;
				}

				// 検証のためのMCP実行（cat, ls, npm test など）
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
		console.warn("  [Check] 検証が膠着しました。安全のためActで一度記憶を整理します。");
		context.state = "ACT";
	}

	return context;
}
