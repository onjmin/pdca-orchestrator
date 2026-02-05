import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";
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
 * 小人が検証ループに陥らないよう、説明文に強い制約を追加。
 */
export const check = createEffect<CheckArgs, CheckData>({
	name: "task.check",
	description:
		"Declare task completion. ONLY use this when you have EVIDENCE that the change is correct (e.g., after verifying with 'file.read_lines'). DO NOT call this immediately after every file modification.",
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
				const title = currentTask.title;
				taskStack.pop();

				// 合格時の報告
				await emitDiscordInternalLog("success", `✅ Task Completed: ${title}\nReason: ${reason}`);

				return effectResult.ok(`Task "${title}" COMPLETED. Environment is now stable.`, {
					status: "completed",
				});
			}

			// --- 失敗（継続）時も報告のみ差し込む ---
			await emitDiscordInternalLog(
				"warning",
				`⚠️ Task Continuing: ${currentTask.title}\nReason: ${reason}`,
			);

			return effectResult.ok(
				`STILL IN PROGRESS: ${reason}. \n` +
					`Hint: Before calling check again, ALWAYS use 'file.read_lines' to verify your changes actually look correct. \n` +
					`If complex logic is involved, use 'task.split' to plan a systematic test.`,
				{ status: "continuing" },
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Check Error**: ${errorMessage}`);
			return effectResult.fail(`Check execution error: ${errorMessage}`);
		}
	},
});
