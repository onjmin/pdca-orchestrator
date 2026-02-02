import "dotenv/config";

import { runPDCA } from "../orchestrator/loop";

async function main() {
	const task = {
		id: "test-001",
		prompt: "discordにHelloを送信せよ",
	};

	try {
		const result = await runPDCA(task);
		console.log("PDCA完了", result);
	} catch (e) {
		console.error("PDCA実行中にエラー", e);
	}
}

main();
