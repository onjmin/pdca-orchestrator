import { storeRAG } from "../rag/store";
import type { PDCAContext } from "./types";

export async function action(context: PDCAContext): Promise<void> {
	if (context.llmOutput) {
		await storeRAG({
			input: context.task.prompt,
			output: context.llmOutput,
			weight: 1,
		});
	}
}
