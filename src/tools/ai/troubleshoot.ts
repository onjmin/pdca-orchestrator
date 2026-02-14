import { z } from "zod";
import { llm } from "../../core/llm-client";
import { createTool, type ToolResponse, toolResult } from "../types";

export const TroubleshootArgsSchema = z.object({
	error: z.string(),
	last_action: z.string(),
	context: z.string().optional(),
});

/**
 * TOOL: ai.troubleshoot
 * 期待した結果と現実の差異を特定し、詰まりを解消するための直接的な手順を生成します。
 */
export const aiTroubleshootTool = createTool<z.infer<typeof TroubleshootArgsSchema>, string>({
	name: "ai.troubleshoot",
	description:
		"Identify why an action failed and get the exact steps to fix the issue and move forward.",
	inputSchema: {
		error: {
			type: "string",
			description: "The specific log or state that is preventing progress.",
		},
		last_action: {
			type: "string",
			description: "The exact tool call or command that didn't work as expected.",
		},
		context: {
			type: "string",
			description: "Surrounding code, file structure, or relevant environment data.",
			isRawData: true,
		},
	},
	handler: async (args): Promise<ToolResponse<string>> => {
		try {
			const { error, last_action, context } = args;

			const systemPrompt = `Analyze the state and resolve the discrepancy.
1. Determine why the last_action failed based on the error and context.
2. Output a direct, tactical sequence of steps to fix the issue.
3. No prose. No preamble. Only technical instructions.`;

			const userPrompt = `ERROR: ${error}\nACTION: ${last_action}\nCONTEXT: ${context}`;

			const result = await llm.complete(`${systemPrompt}\n\n${userPrompt}`);

			if (!result) return toolResult.fail("Failed to generate troubleshooting steps.");

			return toolResult.ok("Tactical fix generated.", result.trim());
		} catch (err) {
			return toolResult.fail(`Troubleshoot Error: ${String(err)}`);
		}
	},
});
