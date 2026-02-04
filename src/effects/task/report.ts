import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export const TaskReportArgsSchema = z.object({
	status: z.enum(["info", "success", "warning", "error"]),
	message: z.string().min(1).describe("The content of the progress report."),
});

export type TaskReportArgs = z.infer<typeof TaskReportArgsSchema>;

/**
 * EFFECT: task.report
 * タスクの進行状況や最終結果を報告する。
 * 外部（Discord）への通知を通じて、人間に現在の進捗を共有する。
 */
export const report = createEffect<TaskReportArgs>({
	name: "task.report",
	description: "Report current task progress or final results to the human supervisor.",
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
				description: "Detailed progress message or summary of work done.",
			},
		},
		required: ["status", "message"],
	},

	handler: async (args: TaskReportArgs): Promise<EffectResponse<void>> => {
		try {
			const { status, message } = TaskReportArgsSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				return effectResult.fail("Reporting system (Discord) is not configured. Report skipped.");
			}

			const icons: Record<string, string> = {
				info: "📝", // infoは報告書っぽく
				success: "🏁", // 完了
				warning: "⚠️",
				error: "🚨",
			};

			const payload = {
				content: `${icons[status] || "🔔"} **[Task Report]**\n${message}`,
			};

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				return effectResult.fail(`Report delivery failed: ${res.status} ${res.statusText}`);
			}

			return effectResult.okVoid(`Progress reported successfully as "${status}".`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Report error: ${errorMessage}`);
		}
	},
});
