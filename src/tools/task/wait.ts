import { z } from "zod";
import { createTool, type ToolResponse, toolResult } from "../types";
import { emitDiscordInternalLog } from "./utils";

export const TaskWaitArgsSchema = z.object({
	ms: z.number().min(100).max(60000).describe("Duration to wait in milliseconds."),
	reason: z.string().describe("What exactly are we waiting for? (e.g., 'Build completion')"),
});

export type TaskWaitArgs = z.infer<typeof TaskWaitArgsSchema>;

/**
 * TOOL: task.wait
 * 指定した時間だけ待機し、Discord にその旨を報告します。
 */
export const taskWaitTool = createTool<TaskWaitArgs, void>({
	name: "task.wait",
	description:
		"Wait for a specified duration during task execution to let external processes sync or complete.",
	inputSchema: {
		ms: {
			type: "number",
			description: "Duration to wait in milliseconds (100 - 60000).",
		},
		reason: {
			type: "string",
			description: "The reason for waiting.",
		},
	},

	handler: async (args: TaskWaitArgs): Promise<ToolResponse<void>> => {
		try {
			const { ms, reason } = TaskWaitArgsSchema.parse(args);

			// 待機開始を Discord に通知
			console.log(`[TaskWait] Waiting for ${ms}ms. Reason: ${reason}`);
			await emitDiscordInternalLog("info", `⏳ **Waiting** for ${ms}ms...\nReason: ${reason}`);

			await new Promise((resolve) => setTimeout(resolve, ms));

			return toolResult.okVoid(`Waiting completed (${ms}ms). Reason: ${reason}`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Wait Error**: ${errorMessage}`);
			return toolResult.fail(`Wait error: ${errorMessage}`);
		}
	},
});
