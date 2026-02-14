import { z } from "zod";
import { taskStack } from "../../core/stack-manager";
import { createTool, type ToolResponse, toolResult } from "../types";
import { emitDiscordInternalLog } from "./utils";

// フラットなスキーマ定義
export const SplitArgsSchema = z.object({
	title: z.string().describe("Clear and concise title for the sub-task."),
	description: z.string().describe("Detailed explanation of what needs to be done."),
	dod: z.string().describe("Specific Definition of Done for this sub-task."),
	reasoning: z.string().describe("Logical reason why this sub-task is the necessary next step."),
});

export type SplitArgs = z.infer<typeof SplitArgsSchema>;

/**
 * EFFECT: task.split
 * サブタスクをスタックに積みます。
 */
export const taskSplitEffect = createTool<SplitArgs, void>({
	name: "task.split",
	description:
		"Create a sub-task to break down implementation or to create a specific verification task.",
	inputSchema: {
		title: {
			type: "string",
			description: "Clear and concise title for the sub-task.",
		},
		description: {
			type: "string",
			description: "Detailed explanation of what needs to be done.",
		},
		dod: {
			type: "string",
			description: "Specific Definition of Done for this sub-task.",
		},
		reasoning: {
			type: "string",
			description: "Logical reason why this sub-task is the necessary next step.",
		},
	},

	handler: async (args: SplitArgs): Promise<ToolResponse<void>> => {
		try {
			// Zodでバリデーション
			const { title, description, dod, reasoning } = SplitArgsSchema.parse(args);
			const currentTask = taskStack.currentTask;

			if (!currentTask) {
				return toolResult.fail("No parent task found in the stack to split.");
			}

			console.log(`[TaskSplit] Reasoning: ${reasoning}`);
			console.log(`[TaskSplit] New Sub-task: ${title}`);

			// スタックに積む
			taskStack.push({
				title: title,
				description: description,
				dod: dod,
				turns: 0,
			});

			// Discord報告
			await emitDiscordInternalLog(
				"info",
				`📂 **Sub-task Pushed**: ${title}\n\n` +
					`**Description**: ${description}\n` +
					`**DoD**: ${dod}\n` +
					`**Reasoning**: ${reasoning}`,
			);

			return toolResult.okVoid(
				`Sub-task "${title}" has been pushed to the stack. Focus on this sub-task now.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await emitDiscordInternalLog("error", `🚨 **Split Error**: ${errorMessage}`);
			return toolResult.fail(`Split error: ${errorMessage}`);
		}
	},
});
