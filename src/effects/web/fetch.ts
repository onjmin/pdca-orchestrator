import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const WebFetchArgsSchema = z.object({
	url: z.string().url(),
	method: z.enum(["GET", "POST"]).default("GET"),
	headers: z.record(z.string(), z.string()).optional(),
});

export type WebFetchArgs = z.infer<typeof WebFetchArgsSchema>;

export interface WebFetchData {
	content: string;
	status: number;
}

/**
 * EFFECT: web.fetch
 * 指定したURLからコンテンツを取得する (curl相当)。
 */
export const fetchContent = createEffect<WebFetchArgs, WebFetchData>({
	name: "web.fetch",
	description:
		"Fetch the raw content from a specific URL. Useful for reading documentation or downloading raw files.",
	inputSchema: {
		type: "object",
		properties: {
			url: { type: "string" },
			method: { type: "string", enum: ["GET", "POST"], default: "GET" },
			headers: { type: "object", additionalProperties: { type: "string" } },
		},
	},

	handler: async (args: WebFetchArgs): Promise<EffectResponse<WebFetchData>> => {
		try {
			const { url, method, headers } = WebFetchArgsSchema.parse(args);

			// 巨大なバイナリ等を避けるための簡単なタイムアウトと設定
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000); // 10秒

			const response = await fetch(url, {
				method,
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			// コンテンツタイプのチェック（バイナリは避ける）
			const contentType = response.headers.get("content-type") ?? "";
			if (
				contentType.includes("image/") ||
				contentType.includes("video/") ||
				contentType.includes("audio/")
			) {
				return effectResult.fail(`Cannot fetch binary content-type: ${contentType}`);
			}

			const content = await response.text();

			// LLMのコンテキスト破壊を防ぐため、10万文字程度で切り捨て
			const MAX_LENGTH = 100000;
			const truncatedContent =
				content.length > MAX_LENGTH
					? content.substring(0, MAX_LENGTH) + "\n... (content truncated)"
					: content;

			return effectResult.ok(`Successfully fetched from ${url} (Status: ${response.status})`, {
				content: truncatedContent,
				status: response.status,
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to fetch URL: ${errorMessage}`);
		}
	},
});
