import "dotenv/config";

import { askLLM } from "../../llm/client";

async function main() {
	const prompt = "Hello, world!";
	const response = await askLLM(prompt);
	console.log("LLM response:", response);
}

main().catch(console.error);
