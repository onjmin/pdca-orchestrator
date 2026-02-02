import { z } from "zod";

/**
 * MCPツール実行結果の基本構造
 */
export const ToolResultSchema = z.object({
	toolCallId: z.string().optional(),
	output: z.string(),
	isError: z.boolean().default(false),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * 成功時のレスポンス生成ヘルパー
 */
export function ok(output: string = "success"): ToolResult {
	return {
		output,
		isError: false,
	};
}

/**
 * 失敗時のレスポンス生成ヘルパー
 */
export function fail(error: unknown): ToolResult {
	return {
		output: error instanceof Error ? error.message : String(error),
		isError: true,
	};
}

/**
 * LLMからのツール呼び出し構造
 */
export const ToolCallSchema = z.object({
	id: z.string(),
	name: z.string(),
	arguments: z.record(z.string(), z.any()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;
