import "dotenv/config";
import { wikipedia } from "../../effects/web/wikipedia";

async function testWikipedia() {
	console.log("--- Wikipedia Effect Test Start ---");

	// テストケース1: 日本語で検索
	console.log("\n[Test 1] Searching for 'TypeScript' in Japanese...");
	const res1 = await wikipedia.handler({
		query: "TypeScript",
	});

	// 'status' ではなく 'success' でチェックします
	if (res1.success) {
		console.log("✅ Success!");
		// success が true の場合のみ data にアクセス可能です
		console.log("Title:", res1.data.title);
		console.log("Extract:", `${res1.data.extract.substring(0, 100)}...`);
		console.log("URL:", res1.data.content_url);
	} else {
		console.error("❌ Failed:", res1.error);
	}

	// テストケース2: 存在しないトピック
	console.log("\n[Test 2] Searching for a non-existent topic...");
	const res2 = await wikipedia.handler({
		query: "ThisIsSomeRandomStringThatDoesNotExistOnWikipedia12345",
	});

	if (!res2.success) {
		console.log("✅ Correctly handled 404 error.");
		console.log("Error Message:", res2.error);
	} else {
		console.error("❌ Unexpected Success. Something is wrong.");
	}

	console.log("\n--- Test Finished ---");
}

testWikipedia().catch(console.error);
