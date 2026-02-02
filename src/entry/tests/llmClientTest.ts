import "dotenv/config";
import { callLLM } from "../../llm/client";
import { mcpRegistry } from "../../mcp/registry";
import { discordWebhookTool } from "../../mcp/webhook";
import type { PDCAContext } from "../../orchestrator/types";

async function main() {
	console.log("🧠 LLM 接続テストを開始します...");

	// 1. ツールの登録（LLMに「何ができるか」を教えるため）
	mcpRegistry.registerInternalTool(discordWebhookTool);

	// 2. ダミーのコンテキスト（状況）を作成
	const dummyContext: PDCAContext = {
		state: "PLAN",
		task: {
			id: `task_${Date.now()}`, // IDを追加
			prompt: "Discordに『準備完了』と報告してください。",
		},
		history: [],
		summary: "起動したばかりのクリーンな状態です。",
		stepCount: 0,
		cycleCount: 0,
		isGoalReached: false,
	};

	const systemPrompt = "あなたは有能なアシスタントです。必要に応じてツールを使用してください。";

	try {
		console.log("--- LLMにリクエスト送信中... ---");
		const output = await callLLM(dummyContext, systemPrompt);

		console.log("\n[LLMの思考]:");
		console.log(output.thought);

		if (output.toolCalls && output.toolCalls.length > 0) {
			console.log("\n[ツール呼び出し検知!]:");
			output.toolCalls.forEach((tc, i) => {
				console.log(`${i + 1}. Tool: ${tc.name}`);
				console.log(`   Args: ${JSON.stringify(tc.arguments)}`);
			});
		} else {
			console.log("\n[通知]: ツール呼び出しは行われませんでした。");
		}
	} catch (err) {
		console.error("\n❌ LLMテスト失敗:", err);
	}
}

main().catch(console.error);
