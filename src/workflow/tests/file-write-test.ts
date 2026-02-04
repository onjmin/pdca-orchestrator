import "dotenv/config";
import fs from "node:fs";
import { getSafePath } from "../../effects/file/utils";
import { write } from "../../effects/file/write";

async function testFileWrite() {
	console.log("--- File Write Effect Test Start ---");

	// テスト用のファイルパス
	const testFileName = "test-output/hello-elf.txt";
	const safePath = getSafePath(testFileName);

	try {
		// 1. 新規ファイルの作成テスト
		console.log(`\n[Test 1] Creating a new file: ${testFileName}`);
		const res1 = await write.handler({
			path: testFileName,
			raw_content_placeholder: "__DATA__",
		});

		if (res1.success) {
			console.log(`✅ Success: ${res1.summary}`);
			// 実際にファイルが作られたか確認
			const content = fs.readFileSync(safePath, "utf8");
			console.log(`Actual file content: "${content}"`);
		} else {
			console.error(`❌ Failed: ${res1.error}`);
		}

		// 2. 既存ファイルの上書きテスト
		console.log(`\n[Test 2] Updating the existing file...`);
		const res2 = await write.handler({
			path: testFileName,
			raw_content_placeholder: "__DATA__",
		});

		if (res2.success) {
			console.log(`✅ Success: ${res2.summary}`);
		} else {
			console.error(`❌ Failed: ${res2.error}`);
		}

		// 3. 安全なパス外への書き込み制限テスト (もし getSafePath がガードしている場合)
		console.log("\n[Test 3] Attempting to write outside safe directory...");
		try {
			const res3 = await write.handler({
				path: "../outside-root.txt",
				raw_content_placeholder: "__DATA__",
			});
			if (!res3.success) {
				console.log(`✅ Correctly blocked: ${res3.error}`);
			} else {
				console.warn("⚠️ Warning: Outside write was not blocked by handler.");
			}
		} catch {
			console.log("✅ Correctly threw error for unsafe path.");
		}
	} catch (err) {
		console.error("❌ Unexpected Error:", err);
	} finally {
		// 後片付け (必要ならコメントアウトを外してください)
		// if (fs.existsSync(safePath)) fs.unlinkSync(safePath);
	}

	console.log("\n--- Test Finished ---");
}

testFileWrite().catch(console.error);
