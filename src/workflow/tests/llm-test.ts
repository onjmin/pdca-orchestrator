import "dotenv/config";
import { llm } from "../../core/llm-client";

async function testLLM() {
	console.log("--- LLM Connection Test Start ---");
	console.log(`Target URL: ${process.env.LLM_API_URL || "Default (LM Studio)"}`);
	console.log(`Target Model: ${process.env.LLM_MODEL || "Default"}`);

	try {
		// テスト 1: 通常のテキスト応答
		console.log("\n[Test 1] Simple Completion...");
		const text = await llm.complete("Say 'Hello, I am ready!' in Japanese.");
		console.log("Response:", text);

		// テスト 2: JSONパースとノイズ除去の確認
		console.log("\n[Test 2] JSON Completion (with noise repair)...");
		const jsonPrompt = `
      Please output the following data in JSON format: { "status": "ok", "message": "test" }.
      Note: You must wrap the JSON with some conversational text like "Here is the data: { ... } Hope it helps!" 
      to test the repair logic.
    `;

		const result = await llm.completeAsJson(jsonPrompt);

		if (result.error) {
			console.error("❌ JSON Test Failed:", result.error);
		} else {
			console.log("✅ JSON Test Success!");
			console.log("Parsed Data:", JSON.stringify(result.data, null, 2));
		}
	} catch (err) {
		console.error("\n❌ Critical Connection Error:");
		if (err instanceof Error) {
			console.error(`Message: ${err.message}`);
		} else {
			console.error(String(err));
		}
		console.log("\nPossible causes:");
		console.log("1. LM Studio / Ollama is not running.");
		console.log("2. API URL in .env is incorrect.");
		console.log("3. Firewall or proxy is blocking the request.");
	}

	console.log("\n--- Test Finished ---");
}

testLLM();
