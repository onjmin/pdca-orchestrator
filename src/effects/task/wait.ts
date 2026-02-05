import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const TaskWaitArgsSchema = z.object({
	ms: z.number().min(100).max(60000).describe("Duration to wait in milliseconds."),
	reason: z
		.string()
		.describe("What exactly are we waiting for? (e.g., 'Build completion', 'Server ready')"),
});

export type TaskWaitArgs = z.infer<typeof TaskWaitArgsSchema>;

/**
 * EFFECT: task.wait
 * タスクの進行を一時待機し、外部状態が整うのを待つ。
 * 闇雲にリトライするのではなく、明示的に「待ち」を入れることで効率的なタスク完遂を目指す。
 */
export const wait = createEffect<TaskWaitArgs, void>({
	name: "task.wait",
	description:
		"Wait for a specified duration during task execution to let external processes sync or complete.",
	inputSchema: {
		type: "object",
		properties: {
			ms: { type: "number" },
			reason: { type: "string" },
		},
	},

	handler: async (args: TaskWaitArgs): Promise<EffectResponse<void>> => {
		const { ms, reason } = TaskWaitArgsSchema.parse(args);
		await new Promise((resolve) => setTimeout(resolve, ms));
		return effectResult.okVoid(`Waiting completed (${ms}ms). Reason: ${reason}`);
	},
});
