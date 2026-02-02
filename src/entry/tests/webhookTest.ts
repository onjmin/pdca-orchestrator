import "dotenv/config";

import { webhook } from "../../mcp/webhook";

async function main() {
	const result = await webhook({
		content: "テスト通知です",
	});

	console.log("Webhook result:", result);

	if (!result.ok) {
		console.error("Webhook送信失敗:", result.error);
	} else {
		console.log("Webhook送信成功");
	}
}

main().catch(console.error);
