import { z } from "zod";
import { ToolCallSchema } from "../mcp/schema";

/**
 * LLMの推論結果（思考 + ツール実行依頼）
 */
export const LLMOutputSchema = z.object({
	thought: z.string().describe("LLMの思考プロセス"),
	toolCalls: z.array(ToolCallSchema).default([]),
});

export type LLMOutput = z.infer<typeof LLMOutputSchema>;

/**
 * APIレスポンス全体のバリデーション（一部抜粋）
 */
export const ChatCompletionResponseSchema = z.object({
	choices: z.array(
		z.object({
			message: z.object({
				content: z.string().nullable(),
				tool_calls: z
					.array(
						z.object({
							id: z.string(),
							type: z.literal("function"),
							function: z.object({
								name: z.string(),
								arguments: z.string(), // APIからはJSON文字列で届く
							}),
						}),
					)
					.optional(),
			}),
		}),
	),
});
