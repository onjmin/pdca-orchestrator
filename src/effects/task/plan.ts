import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { type EffectDefinition, effectResult } from "../types";

/**
 * LLMから受け取る引数の定義
 */
export const PlanArgsSchema = z.object({
	strategy: z.string(), // LLMが考案した解決策や手順
	reasoning: z.string(), // なぜその戦略を選んだのかという根拠
});

/**
 * EFFECT: task.plan
 * 現在のタスクに対する解決戦略を策定し、タスクの記述を更新（補足）する
 */
export const plan: EffectDefinition<z.infer<typeof PlanArgsSchema>> = {
	name: "task.plan",
	description: "Formulate a strategy to achieve the current task's DoD.",
	inputSchema: {
		type: "object",
		properties: {
			strategy: { type: "string" },
			reasoning: { type: "string" },
		},
		required: ["strategy", "reasoning"],
	},
	handler: async ({ strategy, reasoning }) => {
		const currentTask = taskStack.currentTask;
		if (!currentTask) {
			return effectResult.fail("No task found to plan for.");
		}

		// インメモリのタスクオブジェクトを更新
		taskStack.updateCurrentTask({
			strategy,
			reasoning,
		});

		console.log(`[Plan] Strategy recorded for: ${currentTask.title}`);

		return effectResult.ok("Strategy has been updated in memory.");
	},
};
