import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { llm } from "../../core/llm-client";
import { fileCreateEffect } from "../../effects/file/create";
import { fileListTreeEffect } from "../../effects/file/list_tree";
import { getSafePath } from "../../effects/file/utils";
import { shellExecEffect } from "../../effects/shell/exec";

async function main() {
	console.log("--- 職人が起きました（自律テスト・パッケージ事前解決モード） ---");

	const goalPath = resolve(process.cwd(), "GOAL.md");
	let goalContent = "";
	try {
		goalContent = await fs.readFile(goalPath, "utf-8");
	} catch {
		console.error("GOAL.md が見つかりません。");
		return;
	}

	// パッケージ一覧を [PACKAGES] タグで出させるように指示
	let currentPrompt = `
You are an expert developer. Based on the GOAL below, output ALL necessary steps.

[GOAL]
${goalContent}

[REQUIREMENTS]
1. Use Node.js for development.
2. Design tests using 'node:test' and ensure 'npm test' works.

[RULE]
Strictly follow these formats:

1. List ALL npm packages to be installed:
[PACKAGES]
package-name1 package-name2 ...
[/PACKAGES]

2. File creation:
[FILE]
path/to/file.ts
---
content
[/FILE]

3. Additional shell commands:
[SHELL]
command
[/SHELL]
`.trim();

	const MAX_RETRIES = 3;
	let attempt = 0;

	while (attempt < MAX_RETRIES) {
		attempt++;
		console.log(`\n--- 試行 ${attempt}/${MAX_RETRIES} ---`);

		const rawOutput = await llm.complete(currentPrompt);

		// 実行直前の掃除
		const baseDir = getSafePath(".");
		try {
			const files = await fs.readdir(baseDir);
			for (const file of files) {
				if (file === "GOAL.md" || file === ".env") continue;
				await fs.rm(resolve(baseDir, file), { recursive: true, force: true });
			}
			console.log("🧹 ワークスペースを掃除しました。");
		} catch (err) {
			console.warn("⚠️ 掃除失敗:", err);
		}

		// --- 2. [FILE] と [SHELL] のパースと反映 ---
		const pattern = /\[FILE\]\n(.*?)\n---\n([\s\S]*?)\n\[\/FILE\]|\[SHELL\]\n(.*?)\n\[\/SHELL\]/g;
		let match: RegExpExecArray | null;
		match = pattern.exec(rawOutput);
		while (match !== null) {
			const [, filePath, fileContent, shellCommand] = match;
			if (filePath) {
				console.log(`📄 Creating: ${filePath.trim()}`);
				await fileCreateEffect.handler({ path: filePath.trim(), content: fileContent });
			} else if (shellCommand) {
				console.log(`💻 Executing: ${shellCommand.trim()}`);
				await shellExecEffect.handler({
					command: shellCommand.trim(),
					cwd: baseDir,
					timeout: 60000,
				});
			}
			match = pattern.exec(rawOutput);
		}

		// --- 3. 仕上げの npm i & npm test ---
		console.log("🛠️  依存関係の整合性チェック (npm i)...");
		await shellExecEffect.handler({ command: "npm i", cwd: baseDir, timeout: 300000 });

		// --- 1. [PACKAGES] のパースと実行 ---
		const pkgMatch = /\[PACKAGES\]\n([\s\S]*?)\n\[\/PACKAGES\]/.exec(rawOutput);
		if (pkgMatch?.[1].trim()) {
			const packages = pkgMatch[1].trim().replace(/\n/g, " ");
			console.log(`📦 インストール指定パッケージ: ${packages}`);
			await shellExecEffect.handler({
				command: `npm install ${packages}`,
				cwd: baseDir,
				timeout: 300000,
			});
		}

		console.log("🧪 テスト実行 (npm test)...");
		const testResponse = await shellExecEffect.handler({
			command: "npm test",
			cwd: baseDir,
			timeout: 60000,
		});

		if (testResponse.success) {
			console.log("✅ 全てのテストに合格しました！");
			break;
		}

		// --- 4. 失敗時のフィードバック ---
		console.error(`❌ テスト失敗 (試行 ${attempt})`);
		const errorLog = testResponse.error;

		if (attempt >= MAX_RETRIES) break;

		const treeResponse = await fileListTreeEffect.handler({ path: ".", depth: 3 });
		const treeOutput = treeResponse.success ? treeResponse.data?.tree : "N/A";

		currentPrompt = `
Test failed. Analyze the error and FULLY output all corrected blocks including [PACKAGES].

[ERROR LOG]
${errorLog}

[CURRENT TREE]
${treeOutput}

[GOAL]
${goalContent}
`.trim();
	}
}

main().catch(console.error);
