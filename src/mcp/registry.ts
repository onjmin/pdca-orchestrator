import type { ToolCall, ToolResult } from "./schema";
import { webhook } from "./webhook";

const registry: Record<string, (args: ToolCall["args"]) => Promise<ToolResult>> = {
	webhook,
};

/**
 * Orchestrator用 dispatch
 */
export function dispatch(call: ToolCall): Promise<ToolResult> {
	const fn = registry[call.name];
	if (!fn) throw new Error(`Unknown tool: ${call.name}`);
	return fn(call.args);
}
