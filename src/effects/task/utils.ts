import { taskStack } from "../../core/stack-manager";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export type ReportStatus = "info" | "success" | "warning" | "error";

/**
 * Discordへの報告ロジックのコア
 * ツール（Effect）以外からも呼び出せるように共通化
 */
export async function sendDiscordReport(status: ReportStatus, message: string): Promise<void> {
	if (!DISCORD_WEBHOOK_URL) return;

	const progress = taskStack.progress;
	const barLength = 10;
	const filledCount = Math.floor(progress / (100 / barLength));
	const progressBar = "▓".repeat(filledCount) + "░".repeat(barLength - filledCount);

	const icons: Record<ReportStatus, string> = {
		info: "📝",
		success: "🏁",
		warning: "⚠️",
		error: "🚨",
	};

	const header = `${icons[status] || "🔔"} **[Task Report]** \`${progress}%\``;
	const progressLine = `\`${progressBar}\` (Pop: ${taskStack.totalPoppedCount}, Depth: ${taskStack.length})`;

	const payload = {
		content: `${header}\n${progressLine}\n\n${message}`,
	};

	await fetch(DISCORD_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
}
