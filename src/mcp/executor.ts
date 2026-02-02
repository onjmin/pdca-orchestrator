import { mcpRegistry } from "./registry";
import type { ToolCall, ToolResult } from "./schema";

export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
	const { name, arguments: args } = toolCall;

	// 1. まず内部ツールを探す
	const internalTool = mcpRegistry.getInternalTool(name);
	if (internalTool) {
		return await internalTool.handler(args);
	}

	// 2. なければ外部MCPクライアントを探す
	const client = mcpRegistry.getClientByToolName(name);
	if (client) {
		const result = await client.callTool({ name, arguments: args as any });
		return {
			toolCallId: toolCall.id,
			output: JSON.stringify(result.content),
			isError: !!result.isError,
		};
	}

	throw new Error(`Tool ${name} not found.`);
}
