import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { emitDiscordInternalLog } from "./utils"; // インポート追加

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
 * サブタスクをスタックに積みます。
 * 計画の細分化や、特定の検証タスク作成時に Discord へ通知します。
 */
export const split = createEffect<SplitArgs>({
	name: "task.split",
	description:
		"Create a sub-task. Use this to break down implementation OR to create a specific 'Verification Task' to prove a DoD item.",
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

	handler: async (args: SplitArgs): Promise<EffectResponse<void>> => {
		try {
			const { subTask, reasoning } = SplitArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return effectResult.fail("No parent task found in the stack to split.");
			}

			console.log(`[TaskSplit] Reasoning: ${reasoning}`);
			console.log(`[TaskSplit] New Sub-task: ${subTask.title}`);

			taskStack.push({
				title: subTask.title,
				description: subTask.description,
				dod: subTask.dod,
			});

			// --- 裏でこっそり報告 ---
			// 呼び出し元でアイコン（📂）を含める
			await emitDiscordInternalLog(
				"info",
				`📂 **Sub-task Pushed**: ${subTask.title}\n\n` +
					`**Description**: ${subTask.description}\n` +
					`**DoD**: ${subTask.dod}\n` +
					`**Reasoning**: ${reasoning}`,
			);

			return effectResult.okVoid(
				`Sub-task "${subTask.title}" has been pushed to the stack. You are now focusing on this sub-task.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Split Error**: ${errorMessage}`);
			return effectResult.fail(`Split error: ${errorMessage}`);
		}
	},
});
