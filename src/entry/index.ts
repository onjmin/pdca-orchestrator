import "dotenv/config";
import { mcpRegistry } from "../mcp/registry";
import { discordWebhookTool } from "../mcp/webhook";
import { runPDCA } from "../orchestrator/loop";

async function bootstrap() {
	// 1. 内部ツールの登録
	mcpRegistry.registerInternalTool(discordWebhookTool);

	// 2. 外部MCPサーバーの登録（例: ファイルシステム操作など）
	// await mcpRegistry.registerServer(
	//     "filesystem",
	//     "npx",
	//     ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
	// );

	const task = {
		id: `task-${Date.now()}`,
		prompt: process.argv[2] || "ディレクトリ構成を確認して報告せよ",
		done: false,
	};

	console.log("--- Elf Booting Up ---");

	try {
		const result = await runPDCA(task);
		console.log("--- Mission Accomplished ---", result.summary);
	} catch (e) {
		console.error("Critical Failure:", e);
	}
}

bootstrap();
