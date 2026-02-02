import "dotenv/config";
import { discordWebhookTool } from "../../mcp/webhook";

async function main() {
	// オブジェクト内の handler を呼び出し、引数を渡す
	const result = await discordWebhookTool.handler({
		content: "テスト通知です。エルフの靴職人、起動準備完了。 👞",
	});

	console.log("Webhook result raw:", result);

	// ToolResultSchema の定義（isError）に合わせて判定
	if (result.isError) {
		console.error("❌ Webhook送信失敗:", result.output);
	} else {
		console.log("✅ Webhook送信成功:", result.output);
	}
}

main().catch(console.error);
