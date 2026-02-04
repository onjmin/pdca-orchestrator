import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const SplitArgsSchema = z.object({
	subTask: z.object({
		title: z.string().describe("Clear and concise title for the sub-task."),
		description: z.string().describe("Detailed explanation of what needs to be done."),
		dod: z.string().describe("Specific Definition of Done for this sub-task."),
	}),
	reasoning: z.string().describe("Logical reason why this sub-task is the necessary next step."),
});

export type SplitArgs = z.infer<typeof SplitArgsSchema>;

/**
 * EFFECT: task.split
 * サブタスクをスタックに積む。
 * データ返却は不要なため、EffectResponse<void> を約束する。
 */
export const split = createEffect<SplitArgs>({
	name: "task.split",
	description: "Create a focused sub-task and push it onto the stack to begin implementation.",
	inputSchema: {
		type: "object",
		properties: {
			subTask: {
				type: "object",
				properties: {
					title: { type: "string" },
					description: { type: "string" },
					dod: { type: "string" },
				},
				required: ["title", "description", "dod"],
			},
			reasoning: { type: "string" },
		},
		required: ["subTask", "reasoning"],
	},

	// 戻り値を EffectResponse<void> に固定
	handler: async (args: SplitArgs): Promise<EffectResponse<void>> => {
		try {
			const { subTask, reasoning } = SplitArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				// fail は EffectResponse<never> なので void に代入可能
				return effectResult.fail("No parent task found in the stack to split.");
			}

			console.log(`[TaskSplit] Reasoning: ${reasoning}`);
			console.log(`[TaskSplit] New Sub-task: ${subTask.title}`);

			taskStack.push({
				title: subTask.title,
				description: subTask.description,
				dod: subTask.dod,
			});

			// 成功時：okVoid で data: undefined を強制
			return effectResult.okVoid(
				`Sub-task "${subTask.title}" has been pushed to the stack. You are now focusing on this sub-task.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Split error: ${errorMessage}`);
		}
	},
});
