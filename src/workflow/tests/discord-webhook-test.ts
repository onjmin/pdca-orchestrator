import "dotenv/config";
import { emitDiscordInternalLog } from "../../tools/task/utils";

/**
 * emitDiscordInternalLog を単体で実行
 */
async function main() {
	console.log("📡 Sending a direct log to Discord...");

	// 呼び出し元でアイコンや装飾を含めて実行
	await emitDiscordInternalLog(
		"info",
		"🛠️ **Direct Tool Test**\nThis message was sent by calling emitDiscordInternalLog directly.",
	);

	console.log("✨ Done.");
}

main().catch((err) => {
	console.error("💥 Error:", err);
	process.exit(1);
});
