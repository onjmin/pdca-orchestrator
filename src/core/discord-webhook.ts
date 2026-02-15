import { llm } from "./llm-client";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";
// フラグが "1" の時のみLLMを使用（確実にレスポンスが低下するため）
const SHOULD_TRANSLATE_JP = process.env.TRANSLATE_JP === "1";

/**
 * 英語のテキストをLLMで日本語に翻訳する。
 * プロンプトはフォーマットと絵文字を維持するよう指示。
 */
async function translateToJapanese(englishText: string): Promise<string> {
	if (!englishText.trim()) return englishText;

	const prompt = `Translate the following English text to Japanese. Keep the formatting and emojis. Just translate, do not add explanations.\n\n${englishText}`;

	try {
		return await llm.complete(prompt);
	} catch (e) {
		console.error("[LLM] Translation failed, falling back to original text.", e);
		return englishText;
	}
}

/**
 * Discord Webhook を送信する。
 * TRANSLATE_JP=1 の場合はLLMによる翻訳を行うため、完了までに時間がかかります。
 */
export async function emitDiscordWebhook(content: string): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) return;

	// フラグが1なら翻訳し、0ならそのままのコンテンツを使用
	const finalContent = SHOULD_TRANSLATE_JP ? await translateToJapanese(content) : content;

	try {
		await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: finalContent }),
		});
	} catch (e) {
		console.error("[DiscordLog] Failed to send:", e);
	}
}
