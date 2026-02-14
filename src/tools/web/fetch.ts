import { z } from "zod";
import { truncateForPrompt } from "../../core/utils";
import { createTool, type ToolResponse, toolResult } from "../types";

export const WebFetchArgsSchema = z.object({
	url: z.string().url().describe("Target URL to fetch content from."),
	method: z.enum(["GET", "POST"]).describe("HTTP method (GET or POST)."),
	headers: z
		.record(z.string(), z.string())
		.optional()
		.describe("Optional HTTP headers as a key-value object."),
});

export type WebFetchArgs = z.infer<typeof WebFetchArgsSchema>;

export interface WebFetchData {
	content: string;
	status: number;
}

/**
 * EFFECT: web.fetch
 * 指定したURLからコンテンツを取得します。
 */
export const webFetchEffect = createTool<WebFetchArgs, WebFetchData>({
	name: "web.fetch",
	description:
		"Fetch raw content from a URL. Useful for reading documentation or raw source files.",
	inputSchema: {
		url: {
			type: "string",
			description: "Target URL (e.g., https://example.com/doc.md)",
		},
		method: {
			type: "string",
			description: "HTTP method: GET or POST.",
		},
		headers: {
			type: "string",
			description: 'Optional JSON string of headers (e.g., \'{"Authorization": "Bearer..."}\').',
			// ヘッダーに認証情報などが含まれる可能性があるため、STEP 3で安全に取得
			isRawData: true,
		},
	},

	handler: async (args: WebFetchArgs): Promise<ToolResponse<WebFetchData>> => {
		try {
			// 1. まず unknown として受け取り、実体を取り出す
			const raw = args as Record<string, unknown>;
			let processedHeaders = raw.headers;

			// 2. 文字列で届いた場合は JSON としてパースを試みる
			if (typeof processedHeaders === "string") {
				try {
					processedHeaders = JSON.parse(processedHeaders);
				} catch {
					processedHeaders = undefined;
				}
			}

			// 3. Zod で最終的な型チェックを通す
			const { url, method, headers } = WebFetchArgsSchema.parse({
				...raw,
				headers: processedHeaders,
			});

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(url, {
				method,
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			const contentType = response.headers.get("content-type") ?? "";
			if (
				contentType.includes("image/") ||
				contentType.includes("video/") ||
				contentType.includes("audio/")
			) {
				return toolResult.fail(`Cannot fetch binary content-type: ${contentType}`);
			}

			const content = await response.text();

			return toolResult.ok(`Successfully fetched from ${url} (Status: ${response.status})`, {
				content: truncateForPrompt(content, 1000),
				status: response.status,
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`Failed to fetch URL: ${errorMessage}`);
		}
	},
});
