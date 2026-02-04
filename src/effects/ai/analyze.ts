import { z } from "zod";
import { llm } from "../../core/llm-client";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const AnalyzeArgsSchema = z.object({
	instruction: z
		.string()
		.describe("Specific instruction for analysis (e.g., 'Find bugs', 'Summarize')."),
	raw_content_placeholder: z
		.string()
		.describe(
			"MANDATORY: Write ONLY the exact string '__DATA__' here. The actual content will be injected by the orchestrator.",
		),
});

export type AnalyzeArgs = z.infer<typeof AnalyzeArgsSchema>;

/**
 * 解析結果のデータ構造
 */
export interface AnalyzeData {
	analysis: string;
}

/**
 * EFFECT: ai.analyze
 * 外部LLMを使用して特定のコンテンツを詳細に解析する。
 * 成功時には必ず AnalyzeData (analysis) を返すことを型で縛る。
 */
export const analyze = createEffect<AnalyzeArgs, AnalyzeData>({
	name: "ai.analyze",
	description:
		"Analyze the provided text or code using a specialized LLM prompt and return the insight.",
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

	handler: async (args: AnalyzeArgs): Promise<EffectResponse<AnalyzeData>> => {
		try {
			// 1. バリデーション
			const { instruction, raw_content_placeholder } = AnalyzeArgsSchema.parse(args);

			// 2. LLM呼び出し
			const result = await llm.complete(
				`Instruction: ${instruction}\n\nContent to analyze:\n${raw_content_placeholder}`,
			);

			if (!result) {
				// fail は never を返すため、EffectResponse<AnalyzeData> に自動適合
				return effectResult.fail("Analysis failed: LLM returned no response.");
			}

			// 3. 成功時: AnalyzeData の構造を強制
			return effectResult.ok("Analysis completed successfully.", {
				analysis: result,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Analysis error: ${errorMessage}`);
		}
	},
});
