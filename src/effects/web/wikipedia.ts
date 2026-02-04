import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const WebWikipediaArgsSchema = z.object({
	query: z
		.string()
		.describe(
			"The topic or keyword to look up on Wikipedia (e.g., 'Category theory', 'Model Context Protocol').",
		),
	language: z.string().default("ja").describe("The language code (e.g., 'ja', 'en')."),
});

export type WebWikipediaArgs = z.infer<typeof WebWikipediaArgsSchema>;

export interface WebWikipediaData {
	title: string;
	extract: string; // 本文の要約/プレーンテキスト
	content_url: string;
}

/**
 * EFFECT: web.wikipedia
 * WikipediaのAPIを使用して、特定のトピックに関する信頼性の高い情報を取得する。
 * 学術的な概念や固有名詞の背景を調べるために使用。
 */
export const wikipedia = createEffect<WebWikipediaArgs, WebWikipediaData>({
	name: "web.wikipedia",
	description:
		"Fetch a summarized explanation of a specific topic from Wikipedia. Ideal for academic or conceptual background research.",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
			language: { type: "string", default: "ja" },
		},
		required: ["query"],
	},

	handler: async (args: WebWikipediaArgs): Promise<EffectResponse<WebWikipediaData>> => {
		try {
			const { query, language } = WebWikipediaArgsSchema.parse(args);

			// Wikipedia REST API (Summary endpoint)
			// search_depth を考慮せずとも、最も関連性の高い1件の要約を直接取得できる
			const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

			const response = await fetch(endpoint, {
				headers: {
					"User-Agent": "bfa-agent/1.0 (https://github.com/your-repo-name; your-email@example.com)",
				},
			});

			if (response.status === 404) {
				return effectResult.fail(`Topic "${query}" not found on Wikipedia (${language}).`);
			}

			if (!response.ok) {
				return effectResult.fail(`Wikipedia API error: ${response.status}`);
			}

			const data = await response.json();

			// 型に合わせた整形
			const result: WebWikipediaData = {
				title: data.title,
				extract: data.extract, // これがプレーンテキストの要約
				content_url: data.content_urls.desktop.page,
			};

			return effectResult.ok(`Successfully retrieved information about "${result.title}".`, result);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Wikipedia lookup failed: ${errorMessage}`);
		}
	},
});
