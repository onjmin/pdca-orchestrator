import * as v from "valibot";
import { parse } from "valibot";
import { fail, ok, type ToolResult } from "./schema";

/* =========================================================
 * 固定Webhook URL（Node.js v24 で process.env 参照）
 * ======================================================= */
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";
if (!DISCORD_WEBHOOK_URL) {
	throw new Error("DISCORD_WEBHOOK_URL が未設定です");
}

/* =========================================================
 * Webhook Args Schema（通知内容のみ）
 * ======================================================= */
const WebhookArgsSchema = v.object({
	content: v.string(),
});
export type WebhookArgs = v.InferOutput<typeof WebhookArgsSchema>;

/* =========================================================
 * MCP: Discord Webhook
 * ======================================================= */
export async function webhook(args: unknown): Promise<ToolResult> {
	try {
		const a: WebhookArgs = parse(WebhookArgsSchema, args);

		await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content: a.content }),
		});

		return ok();
	} catch (err) {
		return fail(err);
	}
}
