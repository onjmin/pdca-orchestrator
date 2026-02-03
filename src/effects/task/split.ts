import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { type EffectDefinition, effectResult } from "../types";

/**
 * LLMから受け取る引数の定義
 */
export const SplitArgsSchema = z.object({
	subTask: z.object({
		title: z.string(),
		description: z.string(),
		dod: z.string(),
	}),
	reasoning: z.string(), // なぜこの分割が最適だと思ったか
});

/**
 * EFFECT: task.split
 * 戦略を具体化するために、最初の一歩となるサブタスクをスタックに1つ追加する
 */
export const split: EffectDefinition<z.infer<typeof SplitArgsSchema>> = {
	name: "task.split",
	description: "Create the very first sub-task based on the current strategy.",
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
	handler: async ({ subTask, reasoning }) => {
		const currentTask = taskStack.currentTask;
		if (!currentTask) {
			return effectResult.fail("No parent task found to split.");
		}

		console.log(`[Split] Reasoning: ${reasoning}`);
		console.log(`[Split] New Sub-task: ${subTask.title}`);

		// 子タスクをスタックに積む (+1)
		taskStack.push({
			title: subTask.title,
			description: subTask.description,
			dod: subTask.dod,
			// strategyなどは最初は空
		});

		return effectResult.ok(`Sub-task "${subTask.title}" has been pushed to the stack.`);
	},
};
