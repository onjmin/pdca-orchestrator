import { z } from "zod";
import { llm } from "../../core/llm-client";
import type { EffectDefinition } from "../types";

// Zodによる引数の定義
export const AnalyzeArgsSchema = z.object({
	// 解析のための具体的な指示
	instruction: z
		.string()
		.describe("Specific instruction for analysis (e.g., 'Find bugs', 'Summarize')."),
	// JSON破壊を防ぐためのプレースホルダー
	raw_content_placeholder: z
		.string()
		.describe(
			"MANDATORY: Write ONLY the exact string '__DATA__' here. The actual content will be requested separately.",
		),
});

export const analyze: EffectDefinition<z.infer<typeof AnalyzeArgsSchema>> = {
	name: "ai.analyze",
	// LLMがこのツールを選ぶための説明
	description: "Analyze the provided text or code using LLM and return the result.",

	// ZodからJSON Schema的に組み立て（もし自動変換ユーティリティがなければ直接記述）
	inputSchema: {
		type: "object",
		properties: {
			instruction: {
				type: "string",
				description: "Specific instruction for analysis (e.g., 'Find bugs', 'Summarize').",
			},
			raw_content_placeholder: {
				type: "string",
				description: "MANDATORY: Write ONLY the exact string '__DATA__' here.",
			},
		},
		required: ["instruction", "raw_content_placeholder"],
	},

	/**
	 * ハンドラー内部で LLM を再利用して解析を実行する
	 */
	handler: async (args) => {
		try {
			// オーケストレーターによって '__DATA__' が実データに置換された状態で届く
			const result = await llm.complete(
				`Instruction: ${args.instruction}\n\nContent to analyze:\n${args.raw_content_placeholder}`,
			);

			if (!result) {
				return {
					success: false,
					summary: "Analysis failed: LLM returned no response.",
				};
			}

			return {
				success: true,
				summary: "Analysis completed successfully.",
				data: { analysis: result },
			};
		} catch (e: any) {
			return {
				success: false,
				summary: `Analysis error: ${e.message}`,
			};
		}
	},
};
