import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const PlanArgsSchema = z.object({
	strategy: z.string().describe("The step-by-step strategy to achieve the current task's DoD."),
	reasoning: z.string().describe("Logical reasoning for why this strategy is effective."),
});

export type PlanArgs = z.infer<typeof PlanArgsSchema>;

/**
 * EFFECT: task.plan
 * 第2引数 R を省略（デフォルト void）にすることで、
 * 成功時に余計なデータ（data）を返すことを型レベルで禁止する。
 */
export const plan = createEffect<PlanArgs>({
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

	handler: async (args: PlanArgs): Promise<EffectResponse<void>> => {
		try {
			const { strategy, reasoning } = PlanArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				// fail() は EffectResponse<never> を返すので、void 型にも安全に適合
				return effectResult.fail("No active task found in the stack to plan for.");
			}

			taskStack.updateCurrentTask({
				strategy,
				reasoning,
			});

			console.log(`[TaskPlan] Strategy recorded for: ${currentTask.title}`);

			// 成功時：okVoid を使用。
			// これにより、data プロパティには undefined がセットされることが保証される。
			return effectResult.okVoid(
				`Strategy for "${currentTask.title}" has been updated. You can now proceed with implementation.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Planning error: ${errorMessage}`);
		}
	},
});
