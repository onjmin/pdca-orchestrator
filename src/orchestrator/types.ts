// orchestrator/types.ts

import type { LLMOutput } from "../llm/schema";
import type { ToolCall, ToolResult } from "../mcp/schema";

export type Task = {
	id: string;
	prompt: string;
	done?: boolean;
};

export type PDCAContext = {
	task: Task;
	history: string[];
	llmOutput?: LLMOutput;
	toolResult?: ToolResult;
};
