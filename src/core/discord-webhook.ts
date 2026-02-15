import { llm } from "./llm-client";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";
// フラグが "1" の時のみLLMを使用（確実にレスポンスが低下するため）
const SHOULD_TRANSLATE_JP = process.env.TRANSLATE_JP === "1";

/**
 * 英語のテキストをLLMで日本語に翻訳する。
 * プロンプトはフォーマットと絵文字を維持するよう指示。
 */
async function translateToJapanese(englishText: string): Promise<string> {
	if (!SHOULD_TRANSLATE_JP) return englishText;
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
 * 原文のまま Discord Webhook を送信する
 */
export async function emitDiscordWebhook(content: string): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) return;

	try {
		await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content }),
		});
	} catch (e) {
		console.error("[DiscordLog] Failed to send:", e);
	}
}

/**
 * LLMによる日本語翻訳を行ってから Discord Webhook を送信する
 * 完了までに時間がかかります。
 */
export async function emitDiscordWebhookTranslated(content: string): Promise<void> {
	const translatedContent = await translateToJapanese(content);
	await emitDiscordWebhook(translatedContent);
}
