import { dispatch } from "../mcp/registry";
import type { PDCAContext } from "./types";

/**
 * Doフェーズ
 * LLMの指示に従いMCP呼び出し
 */
export async function doPhase(context: PDCAContext): Promise<PDCAContext> {
	if (!context.llmOutput) throw new Error("LLMOutput missing");

	const result = await dispatch({
		name: context.llmOutput.tool,
		args: context.llmOutput.args,
	});

	return { ...context, toolResult: result };
}
