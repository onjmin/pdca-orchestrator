import { z } from "zod";
import { type EffectDefinition, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

// 入力バリデーション用の Zod スキーマ
export const NotifyProgressSchema = z.object({
	status: z.enum(["info", "success", "warning", "error"]),
	message: z.string().min(1),
});

// Zod から型を抽出
export type NotifyProgressArgs = z.infer<typeof NotifyProgressSchema>;

/**
 * EFFECT: web.notify
 * マクロ: ステータスに応じたアイコンを付与し、Discord へ通知する
 */
export const notify: EffectDefinition<NotifyProgressArgs> = {
	name: "notify",
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
	// 型安全なハンドラ
	handler: async (args) => {
		try {
			// バリデーションの実行
			const { status, message } = NotifyProgressSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				throw new Error("DISCORD_WEBHOOK_URL is not configured.");
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
				throw new Error(`Discord API error: ${res.status}`);
			}

			return effectResult.ok(`Notification sent. status: ${status}`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(errorMessage);
		}
	},
};
