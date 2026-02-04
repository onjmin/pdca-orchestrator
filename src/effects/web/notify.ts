import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export const NotifyArgsSchema = z.object({
	status: z.enum(["info", "success", "warning", "error"]),
	message: z.string().min(1),
});

export type NotifyProgressArgs = z.infer<typeof NotifyArgsSchema>;

/**
 * EFFECT: web.notify
 * Discordへの通知。戻り値データは不要なため、EffectResponse<void> を指定。
 */
export const notify = createEffect<NotifyProgressArgs>({
	name: "web.notify",
	description: "Post a structured status update or task report to Discord.",
	inputSchema: {
		type: "object",
		properties: {
			status: {
				type: "string",
				enum: ["info", "success", "warning", "error"],
				description: "Category of the notification.",
			},
			message: {
				type: "string",
				description: "Detail of the progress.",
			},
		},
		required: ["status", "message"],
	},

	// 戻り値型を明示。デフォルト any の余地を消す
	handler: async (args: NotifyProgressArgs): Promise<EffectResponse<void>> => {
		try {
			const { status, message } = NotifyArgsSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				// fail は never を返すため、EffectResponse<void> に適合する
				return effectResult.fail("DISCORD_WEBHOOK_URL is not configured. Notification skipped.");
			}

			const icons: Record<string, string> = {
				info: "ℹ️",
				success: "✅",
				warning: "⚠️",
				error: "🚨",
			};

			const payload = {
				content: `${icons[status] || "🔔"} **[Agent Update]**\n${message}`,
			};

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				return effectResult.fail(`Discord API error: ${res.status} ${res.statusText}`);
			}

			// 成功時: okVoid で data: undefined を確定させる
			return effectResult.okVoid(`Notification sent. status: ${status}`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Notify error: ${errorMessage}`);
		}
	},
});
