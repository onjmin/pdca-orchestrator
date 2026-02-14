import { z } from "zod";
import { createTool, type ToolResponse, toolResult } from "../types";

export const WebSearchArgsSchema = z.object({
	query: z.string().describe("The search query to look up on the internet."),
});

export type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>;

export interface SearchResult {
	url: string;
	content: string;
	title: string;
}

export interface WebSearchData {
	results: SearchResult[];
}

interface TavilyRawResult {
	url: string;
	content: string;
	title: string;
	score: number;
}

interface TavilyResponse {
	results: TavilyRawResult[];
}

/**
 * TOOL: web.search
 * 外部知識が必要な場合にインターネット検索を実行します。
 */
export const webSearchTool = createTool<WebSearchArgs, WebSearchData>({
	name: "web.search",
	description: "Search the web for external knowledge or latest documentation.",
	inputSchema: {
		query: {
			type: "string",
			description: "The specific search query.",
		},
	},

	handler: async (args: WebSearchArgs): Promise<ToolResponse<WebSearchData>> => {
		try {
			const { query } = WebSearchArgsSchema.parse(args);
			const apiKey = process.env.TAVILY_API_KEY;

			if (!apiKey) {
				return toolResult.fail("TAVILY_API_KEY is not set.");
			}

			console.log(`[Tavily] Searching: "${query}"...`);

			const response = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: apiKey,
					query: query,
					search_depth: "basic",
					include_answer: false,
				}),
			});

			if (!response.ok) {
				throw new Error(`Tavily API error: ${response.statusText}`);
			}

			const data = (await response.json()) as TavilyResponse;

			if (!data.results || !Array.isArray(data.results)) {
				return toolResult.ok("Search completed, but no results found.", { results: [] });
			}

			const results: SearchResult[] = data.results.map((r) => ({
				url: r.url,
				content: r.content,
				title: r.title,
			}));

			return toolResult.ok(`Search completed for "${query}".`, { results });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`Web search failed: ${msg}`);
		}
	},
});
