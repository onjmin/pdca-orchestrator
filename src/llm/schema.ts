// llm/schema.ts
import * as v from "valibot";

/**
 * LLMから返ってくる構造
 * 例: JSON string で返すことを想定
 */
export const LLMOutputSchema = v.object({
	tool: v.string(), // orchestratorでdispatchするtool名
	args: v.record(v.string(), v.any()), // tool固有パラメータ
});

export type LLMOutput = v.InferOutput<typeof LLMOutputSchema>;
