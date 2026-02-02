import { askLLM } from "../llm/client";
import { parseLLMOutput } from "../llm/parser";
import type { PDCAContext } from "./types";

const tools = [{ name: "webhook", description: "Discord Webhook送信" }];

export async function plan(context: PDCAContext): Promise<PDCAContext> {
	const prompt = `
タスク: ${context.task.prompt}

使用可能な操作:
${tools.map((t) => `${t.name}: ${t.description}`).join("\n")}

次の行動を1つ選び、ツール名と引数をJSONで返してください
  `;
	const raw = await askLLM(prompt);
	const llmOutput = parseLLMOutput(
		raw,
		tools.map((t) => t.name),
	);
	return { ...context, llmOutput };
}
