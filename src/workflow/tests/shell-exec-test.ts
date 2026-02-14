import "dotenv/config";
import { shellExecTool } from "../../tools/shell/exec";

async function testShellExec() {
	console.log("--- Shell Exec Tool Test Start ---");

	// テストケース1: 成功するコマンド
	console.log("\n[Test 1] Executing a successful command (echo)...");
	const res1 = await shellExecTool.handler({
		command: 'echo "Hello from Shell!"',
		cwd: ".", // フラット化に伴い、明示的に指定
		timeout: 60000,
	});

	if (res1.success) {
		console.log("✅ Success!");
		console.log(`Stdout: ${res1.data.stdout.trim()}`);
	} else {
		console.error(`❌ Failed: ${res1.error}`);
	}

	// テストケース2: 失敗するコマンド
	console.log("\n[Test 2] Executing a failing command (non-existent)...");
	const res2 = await shellExecTool.handler({
		command: "this-command-does-not-exist-12345",
		cwd: ".", // 明示的に指定
		timeout: 60000,
	});

	if (!res2.success) {
		console.log("✅ Correctly handled failure.");
		// エラーメッセージの冒頭を表示
		const shortError = res2.error.split("\n")[0];
		console.log(`Captured Error Message: ${shortError}`);
	} else {
		console.error("❌ Unexpected Success. This should have failed.");
	}

	// テストケース3: ディレクトリ指定
	console.log("\n[Test 3] Checking directory listing...");
	const res3 = await shellExecTool.handler({
		command: process.platform === "win32" ? "dir" : "ls -F",
		cwd: ".",
		timeout: 60000,
	});

	if (res3.success) {
		console.log("✅ Success!");
		console.log(`Stdout preview:\n${res3.data.stdout.split("\n").slice(0, 5).join("\n")}`);
	}

	console.log("\n--- Test Finished ---");
}

testShellExec().catch(console.error);
