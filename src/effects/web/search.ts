import { spawn } from "child_process";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const BRAVE_MCP_PATH = process.env.BRAVE_MCP_PATH ?? "path/to/brave-search/dist/index.js";
const BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? "";

// Brave MCP のレスポンス構造を定義
interface BraveMcpResponse {
	result: {
		content: Array<{
			title?: string;
			url?: string;
			description?: string;
		}>;
	};
}

export const WebSearchArgsSchema = z.object({
	query: z.string().describe("The search query to look up on the internet."),
});

export type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>;

export interface SearchResult {
	title: string;
	url: string;
	description: string;
}

export interface WebSearchData {
	results: SearchResult[];
}

export const search = createEffect<WebSearchArgs, WebSearchData>({
	name: "web.search",
	description: "Search the web using local Brave Search MCP server.",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
		},
		required: ["query"],
	},

	handler: async (args: WebSearchArgs): Promise<EffectResponse<WebSearchData>> => {
		return new Promise((resolve) => {
			try {
				const { query } = WebSearchArgsSchema.parse(args);

				if (!BRAVE_API_KEY) {
					return resolve(effectResult.fail("BRAVE_API_KEY is not configured."));
				}

				const child = spawn("node", [BRAVE_MCP_PATH], {
					env: { ...process.env, BRAVE_API_KEY },
				});

				let responseData = "";

				const request = {
					jsonrpc: "2.0",
					id: 1,
					method: "call_tool",
					params: {
						name: "brave_web_search",
						arguments: { query },
					},
				};

				child.stdin.write(`${JSON.stringify(request)}\n`);

				child.stdout.on("data", (data: Buffer) => {
					responseData += data.toString();
					try {
						// 型を適用してパース
						const json = JSON.parse(responseData) as BraveMcpResponse;
						child.kill();

						const results: SearchResult[] = json.result.content.map((item) => ({
							title: item.title ?? "No Title",
							url: item.url ?? "",
							description: item.description ?? "",
						}));

						resolve(effectResult.ok(`Search completed for "${query}".`, { results }));
					} catch {
						// 不完全なJSONの場合は次のデータ入力を待機
					}
				});

				// タイムアウト処理（5秒応答がなければ強制終了）
				setTimeout(() => {
					child.kill();
					resolve(effectResult.fail("Brave MCP timeout."));
				}, 5000);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				resolve(effectResult.fail(`Web search error: ${errorMessage}`));
			}
		});
	},
});
