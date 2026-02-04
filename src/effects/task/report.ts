import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export const TaskReportArgsSchema = z.object({
	status: z.enum(["info", "success", "warning", "error"]),
	message: z.string().min(1).describe("The content of the progress report."),
});

export type TaskReportArgs = z.infer<typeof TaskReportArgsSchema>;

/**
 * EFFECT: task.report
 * 進捗率（pop数とスタック深度の比率）を算出し、Discordへ報告する。
 */
export const report = createEffect<TaskReportArgs>({
	name: "task.report",
	description:
		"Report current task progress or final results with an auto-calculated progress bar.",
	inputSchema: {
		type: "object",
		properties: {
			status: {
				type: "string",
				enum: ["info", "success", "warning", "error"],
				description: "Category of the report status.",
			},
			message: {
				type: "string",
				description: "Detailed progress message.",
			},
		},
		required: ["status", "message"],
	},

	handler: async (args: TaskReportArgs): Promise<EffectResponse<void>> => {
		try {
			const { status, message } = TaskReportArgsSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				return effectResult.fail("Reporting system (Discord) is not configured.");
			}

			// 進捗率の取得とバーの生成
			const progress = taskStack.progress;
			const barLength = 10;
			const filledCount = Math.floor(progress / (100 / barLength));
			const progressBar = "▓".repeat(filledCount) + "░".repeat(barLength - filledCount);

			const icons: Record<string, string> = {
				info: "📝",
				success: "🏁",
				warning: "⚠️",
				error: "🚨",
			};

			// メッセージの組み立て
			const header = `${icons[status] || "🔔"} **[Task Report]** \`${progress}%\``;
			const progressLine = `\`${progressBar}\` (Pop: ${taskStack.totalPoppedCount}, Depth: ${taskStack.length})`;

			const payload = {
				content: `${header}\n${progressLine}\n\n${message}`,
			};

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				return effectResult.fail(`Report delivery failed: ${res.status}`);
			}

			return effectResult.okVoid(`Progress reported: ${progress}%`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Report error: ${errorMessage}`);
		}
	},
});
