import "dotenv/config";
import { webFetchEffect } from "../../effects/web/fetch";

async function testFetch() {
	console.log("--- Web Fetch Effect Test Start ---");

	// テストケース1: 普通のテキストを取得
	console.log("\n[Test 1] Fetching a text file (GitHub README raw)...");
	const res1 = await webFetchEffect.handler({
		url: "https://raw.githubusercontent.com/npm/cli/latest/README.md",
		method: "GET", // 省略せず明示的に指定
	});

	if (res1.success) {
		console.log("✅ Success!");
		console.log(`Status: ${res1.data.status}`);
		// 文字列結合ではなくテンプレートリテラルを使用 (Biome対応)
		console.log(`Content Preview: ${res1.data.content.substring(0, 150)}...`);
	} else {
		console.error(`❌ Failed: ${res1.error}`);
	}

	// テストケース2: バイナリ（画像）を弾けるか確認
	console.log("\n[Test 2] Fetching an image (should be rejected)...");
	const res2 = await webFetchEffect.handler({
		url: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png",
		method: "GET", // 追加
	});

	if (!res2.success) {
		console.log("✅ Correctly rejected binary content.");
		console.log(`Error Message: ${res2.error}`);
	} else {
		console.error("❌ Unexpected Success. Binary content should have been blocked.");
	}

	console.log("\n--- Test Finished ---");
}

testFetch().catch(console.error);
