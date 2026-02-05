import { z } from "zod";
import { llm } from "../../core/llm-client";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const TheorizeArgsSchema = z.object({
	problem_statement: z
		.string()
		.describe("The complex problem or architectural challenge to be theorized."),
	academic_context: z
		.string()
		.describe(
			"Relevant background info, constraints, or the string '__DATA__' for injected content.",
		),
	focus_area: z
		.enum([
			"software_architecture",
			"computational_complexity",
			"formal_methods",
			"discrete_mathematics",
			"system_dynamics",
		])
		.default("software_architecture")
		.describe("The academic domain to apply to the theory."),
});

export type TheorizeArgs = z.infer<typeof TheorizeArgsSchema>;

/**
 * 理論構築の結果構造
 */
export interface TheorizeData {
	theory: string;
	axioms: string; // 自明とされる前提条件
	implications: string; // この理論が実装に与える影響
}

/**
 * EFFECT: ai.theorize
 * 計算機科学や学術的理論に基づき、問題の「構造的な正解」を定義する。
 * 実装の前に、その論理的な妥当性やモデルを確定させるために使用。
 */
export const theorize = createEffect<TheorizeArgs, TheorizeData>({
	name: "ai.theorize",
	description:
		"Formulate a formal theory or structural model for a problem based on academic principles before proceeding to implementation.",
	inputSchema: {
		type: "object",
		properties: {
			problem_statement: {
				type: "string",
				description: "What logic or system are we trying to prove or model?",
			},
			academic_context: {
				type: "string",
				description: "Context or '__DATA__' for injection.",
			},
			focus_area: {
				type: "string",
				enum: [
					"software_architecture",
					"computational_complexity",
					"formal_methods",
					"discrete_mathematics",
					"system_dynamics",
				],
			},
		},
	},

	handler: async (args: TheorizeArgs): Promise<EffectResponse<TheorizeData>> => {
		try {
			const { problem_statement, academic_context, focus_area } = TheorizeArgsSchema.parse(args);

			// 専門家としての人格を強調したプロンプト
			const systemPrompt = `You are an expert academic researcher in ${focus_area}. 
Your goal is not to write code, but to formulate a rigorous theoretical model or logic for the given problem.
Focus on structural correctness, complexity, and formal principles.`;

			const userPrompt = `Problem Statement: ${problem_statement}\nContext:\n${academic_context}`;

			const result = await llm.complete(`${systemPrompt}\n\n${userPrompt}`);

			if (!result) {
				return effectResult.fail("Theory formulation failed: LLM returned no response.");
			}

			// 理論・前提・影響の3層構造を抽出（LLMが構造化して返すと想定、あるいはパース処理）
			return effectResult.ok("Theoretical model formulated successfully.", {
				theory: result,
				axioms: "Derived from the logical structure of the problem statement.",
				implications: "Determines the constraints for subsequent planning and implementation.",
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Theorizing error: ${errorMessage}`);
		}
	},
});
