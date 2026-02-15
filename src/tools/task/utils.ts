import { emitDiscordWebhookTranslated } from "../../core/discord-webhook";
import { taskStack } from "../../core/stack-manager";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export type LogLevel = "info" | "success" | "warning" | "error";

/**
 * AI(小人)には秘匿された状態で、現在のタスク状況を Discord へバックグラウンド送信する。
 * メッセージの装飾（絵文字など）は呼び出し側で行う。
 */
export async function emitDiscordInternalLog(level: LogLevel, message: string): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) return;

	const progress = taskStack.progress;
	const barLength = 10;
	const filledCount = Math.floor(progress / (100 / barLength));
	const progressBar = "▓".repeat(filledCount) + "░".repeat(barLength - filledCount);

	const header = `**[${level.toUpperCase()}]** \`${progress}%\``;
	const progressLine = `\`${progressBar}\` (Pop: ${taskStack.totalPoppedCount}, Depth: ${taskStack.length})`;

	emitDiscordWebhookTranslated(`${header}\n${progressLine}\n\n${message}`);
}
