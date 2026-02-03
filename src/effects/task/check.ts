import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { type EffectDefinition, effectResult } from "../types";

/**
 * LLMから受け取る引数の定義
 */
export const CheckArgsSchema = z.object({
	observations: z.string(), // 現在の状況の観察
	isPassed: z.boolean(), // DoDを満たしているかどうかのフラグ
	reason: z.string(), // その判定に至った理由
});

/**
 * EFFECT: task.check
 * 現在の状況を評価し、完了していればスタックから削除する
 */
export const check: EffectDefinition<z.infer<typeof CheckArgsSchema>> = {
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
	handler: async ({ observations, isPassed, reason }) => {
		const currentTask = taskStack.currentTask;
		if (!currentTask) {
			return effectResult.fail("No task found in the stack.");
		}

		// 思考のログ出力
		console.log(`[Check] Observation: ${observations}`);
		console.log(`[Check] Reason: ${reason}`);

		if (isPassed) {
			// 合格ならスタックから取り除く (-1)
			taskStack.pop();
			return effectResult.ok(
				`Task "${currentTask.title}" marked as completed and removed from stack.`,
			);
		} else {
			// 不合格なら何もしない (0)
			// 次のループでorchestratorが状況を見て、次のEffect（plan等）を選択する
			return effectResult.ok(`Task "${currentTask.title}" is still in progress.`);
		}
	},
};
