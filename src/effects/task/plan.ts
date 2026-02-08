import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { emitDiscordInternalLog } from "./utils";

export const PlanArgsSchema = z.object({
	strategy: z.string().describe("The step-by-step strategy to achieve the current task's DoD."),
	reasoning: z.string().describe("Logical reasoning for why this strategy is effective."),
});

export type PlanArgs = z.infer<typeof PlanArgsSchema>;

/**
 * EFFECT: task.plan
 * 戦略を策定し、内容を Discord に報告します。
 */
export const taskPlan = createEffect<PlanArgs, void>({
	name: "task.plan",
	description: "Formulate a strategy to achieve the current task's DoD.",
	inputSchema: {
		strategy: {
			type: "string",
			description: "The step-by-step strategy to achieve the current task's DoD.",
		},
		reasoning: {
			type: "string",
			description: "Logical reasoning for why this strategy is effective.",
		},
	},

	handler: async (args: PlanArgs): Promise<EffectResponse<void>> => {
		try {
			const { strategy, reasoning } = PlanArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return effectResult.fail("No active task found in the stack to plan for.");
			}

			taskStack.updateCurrentTask({
				strategy,
				reasoning,
			});

			console.log(`[TaskPlan] Strategy recorded for: ${currentTask.title}`);

			// Discord 報告
			await emitDiscordInternalLog(
				"info",
				`🧠 **New Strategy for**: ${currentTask.title}\n\n` +
					`**Strategy**:\n${strategy}\n\n` +
					`**Reasoning**:\n${reasoning}`,
			);

			return effectResult.okVoid(
				`Strategy for "${currentTask.title}" has been updated. Proceed with implementation.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Plan Error**: ${errorMessage}`);
			return effectResult.fail(`Planning error: ${errorMessage}`);
		}
	},
});
