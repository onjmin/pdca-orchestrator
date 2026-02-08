import { z } from "zod";
import { llm } from "../../core/llm-client";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const TheorizeArgsSchema = z.object({
	problem_statement: z
		.string()
		.describe("The complex problem or architectural challenge to be theorized."),
	academic_context: z.string().describe("Relevant background info or constraints."),
	focus_area: z
		.enum([
			"software_architecture",
			"computational_complexity",
			"formal_methods",
			"discrete_mathematics",
			"system_dynamics",
		])
		.describe("The academic domain to apply to the theory."),
});

export type TheorizeArgs = z.infer<typeof TheorizeArgsSchema>;

export interface TheorizeData {
	theory: string;
	axioms: string;
	implications: string;
}

/**
 * EFFECT: ai.theorize
 * 学術的理論に基づき、問題の構造的なモデルを策定します。
 */
export const aiTheorize = createEffect<TheorizeArgs, TheorizeData>({
	name: "ai.theorize",
	description:
		"Formulate a formal theory or structural model for a problem based on academic principles.",
	inputSchema: {
		problem_statement: {
			type: "string",
			description: "What logic or system are we trying to model?",
		},
		academic_context: {
			type: "string",
			description: "Contextual data or background information.",
			isRawData: true, // 大量のドキュメントやコードを STEP 3 で注入可能にする
		},
		focus_area: {
			type: "string",
			description: "The domain to focus on (e.g., 'software_architecture').",
		},
	},

	handler: async (args: TheorizeArgs): Promise<EffectResponse<TheorizeData>> => {
		try {
			const { problem_statement, academic_context, focus_area } = TheorizeArgsSchema.parse(args);

			const systemPrompt = `You are an expert academic researcher in ${focus_area}. 
Formulate a rigorous theoretical model for the given problem. Focus on structural correctness and formal principles.`;

			const userPrompt = `Problem Statement: ${problem_statement}\nContext:\n${academic_context}`;

			const result = await llm.complete(`${systemPrompt}\n\n${userPrompt}`);

			if (!result) {
				return effectResult.fail("Theory formulation failed: LLM returned no response.");
			}

			return effectResult.ok("Theoretical model formulated successfully.", {
				theory: result,
				axioms: "Derived from the logical structure of the problem.",
				implications: "Determines the constraints for subsequent implementation.",
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Theorizing error: ${errorMessage}`);
		}
	},
});
