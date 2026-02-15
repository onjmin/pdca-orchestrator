import { llm } from "./llm-client";
import { taskStack } from "./stack-manager";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export type LogLevel = "info" | "success" | "warning" | "error";

async function translateToJapanese(englishText: string): Promise<string> {
	const prompt = `Translate the following English text to Japanese. Keep the formatting and emojis. Just translate, do not add explanations.

${englishText}`;

	return await llm.complete(prompt);
}

export async function emitDiscordLogWithTranslation(
	level: LogLevel,
	message: string,
	progress?: number,
	progressDetails?: { popped: number; depth: number },
): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) return;

	const currentProgress = progress ?? taskStack.progress;
	const details = progressDetails ?? {
		popped: taskStack.totalPoppedCount,
		depth: taskStack.length,
	};

	const barLength = 10;
	const filledCount = Math.floor(currentProgress / (100 / barLength));
	const progressBar = "▓".repeat(filledCount) + "░".repeat(barLength - filledCount);

	const header = `**[${level.toUpperCase()}]** \`${currentProgress}%\``;
	const progressLine = `\`${progressBar}\` (Pop: ${details.popped}, Depth: ${details.depth})`;

	const japaneseMessage = await translateToJapanese(message);

	const payload = {
		content: `${header}\n${progressLine}\n\n${japaneseMessage}`,
	};

	try {
		await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	} catch (e) {
		console.error("[DiscordLog] Failed to send:", e);
	}
}
