import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

export const WebSearchArgsSchema = z.object({
	query: z.string().describe("The search query to look up on the internet."),
	search_depth: z.enum(["basic", "advanced"]).default("basic").describe("The depth of the search."),
});

export type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>;

export interface SearchResult {
	title: string;
	url: string;
	content: string; // 抽出された本文
}

export interface WebSearchData {
	results: SearchResult[];
}

/**
 * EFFECT: web.search
 * インターネットから最新情報やドキュメントを検索する。
 * ライブラリの仕様変更やエラーの解決策を調べるために使用。
 */
export const search = createEffect<WebSearchArgs, WebSearchData>({
	name: "web.search",
	description:
		"Search the web for real-time information and documentation. Useful for solving errors or checking library updates.",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
			search_depth: { type: "string", enum: ["basic", "advanced"], default: "basic" },
		},
		required: ["query"],
	},

	handler: async (args: WebSearchArgs): Promise<EffectResponse<WebSearchData>> => {
		try {
			const { query, search_depth } = WebSearchArgsSchema.parse(args);

			if (!TAVILY_API_KEY) {
				return effectResult.fail("TAVILY_API_KEY is not configured in environment variables.");
			}

			const response = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: TAVILY_API_KEY,
					query,
					search_depth,
					include_answer: false,
					max_results: 5,
				}),
			});

			if (!response.ok) {
				return effectResult.fail(`Search API error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			// 必要な情報（タイトル、URL、本文）だけを抽出して型に合わせる
			const results: SearchResult[] = data.results.map((r: any) => ({
				title: r.title,
				url: r.url,
				content: r.content,
			}));

			return effectResult.ok(`Found ${results.length} relevant pages for "${query}".`, { results });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Web search failed: ${errorMessage}`);
		}
	},
});
