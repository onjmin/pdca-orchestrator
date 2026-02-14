import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createTool, type ToolResponse, toolResult } from "../types";
import { emitDiscordInternalLog } from "./utils";

export const CheckArgsSchema = z.object({
	observations: z.string().describe("Current observation of the environment or task status."),
	isPassed: z.boolean().describe("Whether the current task meets the Definition of Done (DoD)."),
	reason: z.string().describe("The reasoning behind this pass/fail judgment."),
});

export type CheckArgs = z.infer<typeof CheckArgsSchema>;

export interface CheckData {
	status: "completed" | "continuing";
}

/**
 * EFFECT: task.check
 * タスクの完了を判定します。
 */
export const taskCheckEffect = createTool<CheckArgs, CheckData>({
	name: "task.check",
	description:
		"Evaluate the current task status against the Definition of Done (DoD). Use this to declare the task as 'passed' (completed) or 'failed' (needs more work).",
	inputSchema: {
		observations: {
			type: "string",
			description: "Current observation of the environment or task status.",
		},
		isPassed: {
			type: "boolean",
			description: "True if the task meets the DoD.",
		},
		reason: {
			type: "string",
			description: "Reasoning for this judgment based on evidence.",
		},
	},

	handler: async (args: CheckArgs): Promise<ToolResponse<CheckData>> => {
		try {
			const { observations, isPassed, reason } = CheckArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return toolResult.fail("No task found in the stack. Cannot perform check.");
			}

			console.log(`[TaskCheck] Observation: ${observations}`);
			console.log(`[TaskCheck] Result: ${isPassed ? "PASSED" : "FAILED"}`);
			console.log(`[TaskCheck] Reason: ${reason}`);

			if (isPassed) {
				const title = currentTask.title;
				taskStack.pop();

				await emitDiscordInternalLog("success", `✅ Task Completed: ${title}\nReason: ${reason}`);

				return toolResult.ok(`Task "${title}" COMPLETED. Environment is now stable.`, {
					status: "completed",
				});
			}

			await emitDiscordInternalLog(
				"warning",
				`⚠️ Task Continuing: ${currentTask.title}\nReason: ${reason}`,
			);

			// 説教（Hint）を削除し、純粋な結果のみを返す
			return toolResult.ok(`STILL IN PROGRESS: ${reason}.`, { status: "continuing" });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Check Error**: ${errorMessage}`);
			return toolResult.fail(`Check execution error: ${errorMessage}`);
		}
	},
});
