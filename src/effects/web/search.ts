import { z } from "zod";
import { mcpManager } from "../../core/mcp-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

// DuckDuckGo MCP のレスポンス構造（ツール実行結果）
interface DuckDuckGoMcpResult {
	content: Array<{
		type: string;
		text: string;
	}>;
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
	description: "Search the web using DuckDuckGo (Free, No API Key required).",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
		},
		required: ["query"],
	},

	handler: async (args: WebSearchArgs): Promise<EffectResponse<WebSearchData>> => {
		try {
			const { query } = WebSearchArgsSchema.parse(args);

			// mcpManager に注文を投げるだけ。
			// 内部でプロセス管理、JSON-RPC、タイムアウト処理をすべてやってくれます。
			const rawResult = await mcpManager.callTool("DUCKDUCKGO", "duckduckgo_search", {
				query,
			});

			const mcpResult = rawResult as DuckDuckGoMcpResult;

			// DuckDuckGo MCP は検索結果を一つのテキスト、または複数のテキストブロックで返します
			const results: SearchResult[] = mcpResult.content.map((item) => ({
				title: "Search Result",
				url: "", // DuckDuckGo MCPは通常text内にURLが含まれるため、必要に応じて正規表現で抽出
				description: item.text ?? "",
			}));

			return effectResult.ok(`Search completed for "${query}".`, { results });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Web search error: ${errorMessage}`);
		}
	},
});
