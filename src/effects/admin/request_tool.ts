import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export const RequestToolArgsSchema = z.object({
	name: z.string().describe("The name of the tool or capability you are requesting."),
	reason: z.string().describe("Why is this necessary? Describe the current limitation."),
	spec: z.string().describe("Detailed specification for implementation (input/output)."),
});

export type RequestToolArgs = z.infer<typeof RequestToolArgsSchema>;

/**
 * EFFECT: admin.request_tool
 * 管理者に新しいツールの追加を要望する。
 * 内容は Discord 経由で管理者に送信される。
 */
export const requestTool = createEffect<RequestToolArgs, void>({
	name: "admin.request_tool",
	description:
		"Request a new tool from the admin via Discord. Note: This tool is for future system improvement and is NOT immediately available.",
	inputSchema: {
		type: "object",
		properties: {
			name: { type: "string" },
			reason: { type: "string" },
			spec: { type: "string" },
		},
		required: ["name", "reason", "spec"],
	},

	handler: async (args: RequestToolArgs): Promise<EffectResponse<void>> => {
		try {
			const { name, reason, spec } = RequestToolArgsSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				return effectResult.fail("Admin notification system is not configured. Request failed.");
			}

			// 要望を目立たせるための Discord ペイロード
			const payload = {
				content: `🛠️ **[New Tool Request]**\n**Name:** ${name}\n**Reason:** ${reason}\n**Specification:**\n\`\`\`\n${spec}\n\`\`\``,
			};

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				return effectResult.fail(`Failed to send request to Discord: ${res.status}`);
			}

			// エージェントには「ログはとったが、すぐには使えない」ことを強調して返す
			return effectResult.okVoid(
				`Your request for "${name}" has been sent to the admin's Discord. ` +
					`Note: This capability is NOT yet active. You must find an alternative way to continue the current task.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Request error: ${errorMessage}`);
		}
	},
});
