import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { llm } from "../../core/llm-client";
import { fileCreateEffect } from "../../effects/file/create";
import { fileListTreeEffect } from "../../effects/file/list_tree";
import { getSafePath } from "../../effects/file/utils";
import { shellExecEffect } from "../../effects/shell/exec";

/**
 * Scaffolder (足場職人)
 * * 小人の靴屋（orchestrator）がコツコツと靴を直すのに対し、
 * この足場職人は、現場を更地にし、資材（パッケージ）を揃え、
 * 一気にプロジェクトの土台を組み上げます。
 */
export async function run() {
	console.log("--- 足場職人が起きました（一括構築・自動検査モード） ---");

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
		console.log(`\n--- 建設試行 ${attempt}/${MAX_RETRIES} ---`);

		const rawOutput = await llm.complete(currentPrompt);

		// 実行直前の掃除：現場を更地にする
		const baseDir = getSafePath(".");
		try {
			const files = await fs.readdir(baseDir);
			for (const file of files) {
				if (file === "GOAL.md" || file === ".env") continue;
				await fs.rm(resolve(baseDir, file), { recursive: true, force: true });
			}
			console.log("🧹 現場を掃除し、更地に戻しました。");
		} catch (err) {
			console.warn("⚠️ 掃除失敗:", err);
		}

		// --- 1. [FILE] と [SHELL] のパースと反映 ---
		const pattern = /\[FILE\]\n(.*?)\n---\n([\s\S]*?)\n\[\/FILE\]|\[SHELL\]\n(.*?)\n\[\/SHELL\]/g;
		let match: RegExpExecArray | null;
		match = pattern.exec(rawOutput);
		while (match !== null) {
			const [, filePath, fileContent, shellCommand] = match;
			if (filePath) {
				console.log(`📄 Building: ${filePath.trim()}`);
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

		// --- 2. 仕上げの npm i & npm test ---
		console.log("🛠️  依存関係の整合性チェック (npm i)...");
		await shellExecEffect.handler({ command: "npm i", cwd: baseDir, timeout: 300000 });

		// --- 3. [PACKAGES] のパースと実行 ---
		const pkgMatch = /\[PACKAGES\]\n([\s\S]*?)\n\[\/PACKAGES\]/.exec(rawOutput);
		if (pkgMatch?.[1].trim()) {
			const packages = pkgMatch[1].trim().replace(/\n/g, " ");
			console.log(`📦 指定された資材を搬入（npm install）: ${packages}`);
			await shellExecEffect.handler({
				command: `npm install ${packages}`,
				cwd: baseDir,
				timeout: 300000,
			});
		}

		console.log("🧪 完成検査 (npm test) を開始...");
		const testResponse = await shellExecEffect.handler({
			command: "npm test",
			cwd: baseDir,
			timeout: 60000,
		});

		if (testResponse.success) {
			console.log("✅ 全てのテストに合格しました！足場の完成です。");
			break;
		}

		// --- 4. 失敗時のフィードバック ---
		console.error(`❌ 検査失敗 (試行 ${attempt})`);
		const errorLog = testResponse.error;

		if (attempt >= MAX_RETRIES) {
			console.error("限界回数に達しました。建設を中止します。");
			break;
		}

		const treeResponse = await fileListTreeEffect.handler({ path: ".", depth: 3 });
		const treeOutput = treeResponse.success ? treeResponse.data?.tree : "N/A";

		console.log("エラーを分析し、設計図を引き直します...");
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
