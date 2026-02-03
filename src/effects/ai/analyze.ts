import { llm } from "../../core/llm-client";
import { type EffectDefinition, effectResult } from "../types";

export const analyze: EffectDefinition<any> = {
	name: "ai.analyze",
	description: "Use an LLM to analyze text or generate creative content.",
	inputSchema: {
		type: "object",
		properties: {
			instruction: {
				type: "string",
				description: "Specific instruction for the analysis (e.g., 'Summarize', 'Find bugs')",
			},
			text: {
				type: "string",
				description: "The target text to be analyzed.",
			},
		},
		required: ["instruction", "text"],
	},
	handler: async ({ instruction, text }) => {
		// 内部でコアの llm-client を再利用
		const result = await llm.complete(`Instruction: ${instruction}\nText: ${text}`);
		return effectResult.ok(result);
	},
};
