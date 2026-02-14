import "dotenv/config";
import { webSearchEffect } from "../../tools/web/search";

async function testWebSearch() {
	console.log("--- Tavily Search Effect Test Start ---");

	// 1. APIキーの存在確認
	if (!process.env.TAVILY_API_KEY) {
		console.error("❌ Error: TAVILY_API_KEY is not set in .env file.");
		process.exit(1);
	}

	// 2. 検索の実行（小人がよくやりそうな具体的なクエリ）
	const query = "Latest stable version of Hono framework and its features";
	console.log(`[Test] Searching for: "${query}"...`);

	const res = await webSearchEffect.handler({
		query: query,
	});

	// 3. 結果の判定
	if (res.success) {
		console.log(`✅ Success: ${res.summary}`);

		// 取得したデータの構造を確認
		const data = res.data;
		if (data && data.results.length > 0) {
			console.log(`[Test] Found ${data.results.length} results.`);

			// 最初の1件だけ中身を表示
			const topResult = data.results[0];
			console.log("--- Top Result ---");
			console.log(`Title:   ${topResult.title}`);
			console.log(`URL:     ${topResult.url}`);
			console.log(`Content snippet: ${topResult.content.substring(0, 150)}...`);
			console.log("------------------");
		} else {
			console.warn("⚠️ Warning: Search succeeded but returned 0 results.");
		}
	} else {
		console.error(`❌ Search Failed: ${res.error}`);
	}

	console.log("--- Test Finished ---");
}

testWebSearch().catch((err) => {
	console.error("Unexpected test error:", err);
	process.exit(1);
});
