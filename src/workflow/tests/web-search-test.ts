import "dotenv/config";
import { mcpManager } from "../../core/mcp-manager";
import { search } from "../../effects/web/search";

async function testSearch() {
	console.log("--- DuckDuckGo Search Effect Test Start ---");
	console.log("MCP Command:", process.env.DUCKDUCKGO_MCP_COMMAND);

	try {
		// テストケース: 「Model Context Protocol」について検索
		const query = "Model Context Protocol";
		console.log(`\n[Test] Searching for: "${query}"...`);
		console.log("(初回は npx の起動待ちで 10秒ほどかかる場合があります)");

		const res = await search.handler({
			query: query,
		});

		if (res.success) {
			console.log("✅ Success!");
			console.log(`Summary: ${res.summary}`);

			// 結果の表示
			if (res.data.results.length > 0) {
				console.log("\n--- Search Results ---");
				for (const item of res.data.results.slice(0, 3)) {
					// 最初の3件
					console.log(`- Content: ${item.description.substring(0, 150)}...`);
					console.log("---");
				}
			} else {
				console.log("⚠️ No results found.");
			}
		} else {
			console.error("❌ Failed!");
			console.error("Error Message:", res.error);
		}
	} catch (err) {
		console.error("❌ Critical Error during test:", err);
	} finally {
		// 重要: 常駐プロセスを終了させないとスクリプトが終わりません
		console.log("\n[Cleanup] Shutting down MCP server...");
		mcpManager.shutdown();
	}

	console.log("--- Test Finished ---");
}

testSearch().catch(console.error);
