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
 * 改修前のロジック（isPassedによる分岐とスタック操作）を維持しつつ、
 * Union型ベースの厳格な型定義へ適合。
 */
export const check = createEffect<CheckArgs, CheckData>({
	name: "task.check",
	description: "Evaluate the current situation against the Definition of Done (DoD).",
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
			// 1. バリデーションとコンテキスト確認
			const { observations, isPassed, reason } = CheckArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return effectResult.fail("No task found in the stack. Cannot perform check.");
			}

			// 2. ログ出力
			console.log(`[TaskCheck] Observation: ${observations}`);
			console.log(`[TaskCheck] Result: ${isPassed ? "PASSED" : "FAILED"}`);
			console.log(`[TaskCheck] Reason: ${reason}`);

			// 3. 元のロジックに基づく分岐
			if (isPassed) {
				taskStack.pop(); // 合格ならタスク完了
				return effectResult.ok(
					`Task "${currentTask.title}" marked as completed and removed from stack.`,
					{ status: "completed" },
				);
			} else {
				// 不合格なら継続。reason を summary に含めて AI へフィードバック
				return effectResult.ok(
					`Task "${currentTask.title}" is still in progress. Reasoning: ${reason}`,
					{ status: "continuing" },
				);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Check execution error: ${errorMessage}`);
		}
	},
});
