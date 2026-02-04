import "dotenv/config";
import { exec } from "../../effects/shell/exec";

async function testShellExec() {
	console.log("--- Shell Exec Effect Test Start ---");

	// テストケース1: 成功するコマンド
	console.log("\n[Test 1] Executing a successful command (echo)...");
	const res1 = await exec.handler({
		command: 'echo "Hello from Shell!"',
		timeout: 60000, // 明示的に指定
	});

	if (res1.success) {
		console.log("✅ Success!");
		console.log(`Stdout: ${res1.data.stdout.trim()}`);
	} else {
		console.error(`❌ Failed: ${res1.error}`);
	}

	// テストケース2: 失敗するコマンド
	console.log("\n[Test 2] Executing a failing command (non-existent)...");
	const res2 = await exec.handler({
		command: "this-command-does-not-exist-12345",
		timeout: 60000, // 追加
	});

	if (!res2.success) {
		console.log("✅ Correctly handled failure.");
		console.log(`Captured Error Message:\n${res2.error}`);
	} else {
		console.error("❌ Unexpected Success. This should have failed.");
	}

	// テストケース3: ディレクトリ指定
	console.log("\n[Test 3] Checking directory listing...");
	const res3 = await exec.handler({
		command: process.platform === "win32" ? "dir" : "ls -F",
		cwd: ".",
		timeout: 60000, // 追加
	});

	if (res3.success) {
		console.log("✅ Success!");
		console.log(`Stdout preview:\n${res3.data.stdout.split("\n").slice(0, 5).join("\n")}`);
	}

	console.log("\n--- Test Finished ---");
}

testShellExec().catch(console.error);
