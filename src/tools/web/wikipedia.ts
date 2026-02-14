import { z } from "zod";
import { createTool, type ToolResponse, toolResult } from "../types";

export const WebWikipediaArgsSchema = z.object({
	query: z.string().describe("The topic or keyword to look up (e.g., 'Category theory')."),
});

export type WebWikipediaArgs = z.infer<typeof WebWikipediaArgsSchema>;

export interface WebWikipediaData {
	title: string;
	extract: string;
	content_url: string;
}

/**
 * EFFECT: web.wikipedia
 * Wikipedia の API を使用して、特定のトピックに関する情報を取得します。
 */
export const webWikipediaTool = createTool<WebWikipediaArgs, WebWikipediaData>({
	name: "web.wikipedia",
	description: "Fetch a summarized explanation of a specific topic from Wikipedia.",
	inputSchema: {
		query: {
			type: "string",
			description: "The topic or keyword to search for.",
		},
	},

	handler: async (args: WebWikipediaArgs): Promise<ToolResponse<WebWikipediaData>> => {
		try {
			const { query } = WebWikipediaArgsSchema.parse(args);

			// Wikipedia REST API (Summary endpoint)
			const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

			const response = await fetch(endpoint, {
				headers: {
					"User-Agent": "bfa-agent/1.0 (contact: your-email@example.com)",
				},
			});

			if (response.status === 404) {
				return toolResult.fail(`Topic "${query}" not found on Wikipedia.`);
			}

			if (!response.ok) {
				return toolResult.fail(`Wikipedia API error: ${response.status}`);
			}

			const data = await response.json();

			const result: WebWikipediaData = {
				title: data.title,
				extract: data.extract,
				content_url: data.content_urls?.desktop?.page ?? "",
			};

			return toolResult.ok(`Successfully retrieved information about "${result.title}".`, result);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`Wikipedia lookup failed: ${errorMessage}`);
		}
	},
});
