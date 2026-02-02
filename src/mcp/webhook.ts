import { z } from "zod";
import { fail, ok, type ToolResult } from "./schema";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

/**
 * Webhook 引数の Zod スキーマ
 */
export const WebhookArgsSchema = z.object({
	content: z.string().min(1, "メッセージ内容を入力してください"),
});

export type WebhookArgs = z.infer<typeof WebhookArgsSchema>;

/**
 * MCP風に扱うための内部ツール定義
 */
export const discordWebhookTool = {
	name: "send_discord_message",
	description: "作業の進捗や完了報告を Discord に通知します。",
	// LLMに提示するためのスキーマ（Zodから生成可能ですが、一旦プレーンに記述）
	inputSchema: {
		type: "object",
		properties: {
			content: {
				type: "string",
				description: "通知するテキストメッセージ",
			},
		},
		required: ["content"],
	},
	handler: async (args: unknown): Promise<ToolResult> => {
		try {
			// Zod によるバリデーション
			const parsed = WebhookArgsSchema.parse(args);

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: parsed.content }),
			});

			if (!res.ok) {
				throw new Error(`Discord API error: ${res.status}`);
			}

			return ok("Discord への送信に成功しました");
		} catch (err) {
			// ZodError も含めて fail でラップ
			return fail(err instanceof Error ? err.message : String(err));
		}
	},
};
