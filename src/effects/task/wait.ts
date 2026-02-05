import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const TaskWaitArgsSchema = z.object({
	ms: z.number().min(100).max(60000).describe("Duration to wait in milliseconds."),
	reason: z.string().describe("What exactly are we waiting for? (e.g., 'Build completion')"),
});

export type TaskWaitArgs = z.infer<typeof TaskWaitArgsSchema>;

/**
 * EFFECT: task.wait
 * 指定した時間だけ待機します。
 */
export const wait = createEffect<TaskWaitArgs, void>({
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

	handler: async (args: TaskWaitArgs): Promise<EffectResponse<void>> => {
		try {
			const { ms, reason } = TaskWaitArgsSchema.parse(args);

			console.log(`[TaskWait] Waiting for ${ms}ms. Reason: ${reason}`);
			await new Promise((resolve) => setTimeout(resolve, ms));

			return effectResult.okVoid(`Waiting completed (${ms}ms). Reason: ${reason}`);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Wait error: ${errorMessage}`);
		}
	},
});
