import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

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
 * 小人が検証ループに陥らないよう、説明文に強い制約を追加。
 */
export const check = createEffect<CheckArgs, CheckData>({
	name: "task.check",
	description: "Verify DoD. DO NOT call this twice without taking other actions.",
	inputSchema: {
		type: "object",
		properties: {
			observations: { type: "string" },
			isPassed: { type: "boolean" },
			reason: { type: "string" },
		},
		required: ["observations", "isPassed", "reason"],
	},

	handler: async (args: CheckArgs): Promise<EffectResponse<CheckData>> => {
		try {
			const { observations, isPassed, reason } = CheckArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return effectResult.fail("No task found in the stack. Cannot perform check.");
			}

			console.log(`[TaskCheck] Observation: ${observations}`);
			console.log(`[TaskCheck] Result: ${isPassed ? "PASSED" : "FAILED"}`);
			console.log(`[TaskCheck] Reason: ${reason}`);

			if (isPassed) {
				taskStack.pop();
				return effectResult.ok(
					`Task "${currentTask.title}" COMPLETED. Environment is now stable.`,
					{ status: "completed" },
				);
			}

			// 失敗時：小人に「次に何をすべきか」を考えさせるフィードバックを返す
			return effectResult.ok(
				`FAILED: "${currentTask.title}" is NOT done. ${reason}. DO NOT check again immediately; perform an action to verify or fix first.`,
				{ status: "continuing" },
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Check execution error: ${errorMessage}`);
		}
	},
});
