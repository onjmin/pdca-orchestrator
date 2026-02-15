import "dotenv/config";
import { emitDiscordWebhook } from "../../core/discord-webhook";

/**
 * emitDiscordLogWithTranslation を単体で実行
 */
async function main() {
	console.log("📡 Sending a direct log to Discord...");

	// 送信したい純粋なメッセージ
	const message =
		"The LLM will translate this sentence into Japanese if the TRANSLATE_JP flag is set to 1. This process will definitely take some time due to the inference overhead.";

	// 実行
	// TRANSLATE_JP=1 の場合はLLMを介すため、ここで待機時間が発生します
	await emitDiscordWebhook(message);

	console.log("✨ Done.");
}

main().catch((err) => {
	console.error("💥 Error:", err);
	process.exit(1);
});
