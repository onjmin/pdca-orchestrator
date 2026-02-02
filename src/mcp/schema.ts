// mcp/schema.ts
import * as v from "valibot";

/* =========================================================
 * ToolCall（orchestrator → MCP）
 * ======================================================= */

/**
 * すべてのMCP呼び出しの共通フォーマット
 * args は tool 側で具体validateするため unknown
 */
export const ToolCallSchema = v.object({
	name: v.string(),
	args: v.unknown(),
});

export type ToolCall = v.InferOutput<typeof ToolCallSchema>;

/* =========================================================
 * ToolResult（MCP → orchestrator）
 * ======================================================= */

/**
 * 例外を投げず、必ずこの形で返す（超重要）
 * orchestratorは ok だけ見ればよくなる
 */
export const ToolResultSchema = v.object({
	ok: v.boolean(),
	data: v.optional(v.unknown()),
	error: v.optional(v.string()),
});

export type ToolResult = v.InferOutput<typeof ToolResultSchema>;

/* =========================================================
 * ヘルパー（任意・実務で便利）
 * ======================================================= */

export const ok = (data?: unknown): ToolResult => ({
	ok: true,
	data,
});

export const fail = (error: unknown): ToolResult => ({
	ok: false,
	error: String(error),
});
