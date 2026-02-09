import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { llm } from "../../core/llm-client";
import { fileCreateEffect } from "../../effects/file/create";
import { fileListTreeEffect } from "../../effects/file/list_tree";
import { shellExecEffect } from "../../effects/shell/exec";

async function main() {
	console.log("--- 職人が起きました（自律テスト・修復モード） ---");

	const goalPath = resolve(process.cwd(), "GOAL.md");
	let goalContent = "";
	try {
		goalContent = await fs.readFile(goalPath, "utf-8");
	} catch {
		console.error("GOAL.md が見つかりません。");
		return;
	}

	// 初回プロンプトの構築
	let currentPrompt = `
You are an expert developer. Based on the GOAL below, output ALL necessary file creations and shell commands to complete the task at once.

[GOAL]
${goalContent}

[REQUIREMENTS]
1. Use Node.js for development.
2. Design tests using 'node:test' and ensure they can be executed with 'npm test'.

[RULE]
You must output using the following formats strictly. Do not use markdown code blocks for the output itself.

For file creation:
[FILE]
path/to/file.ts
---
content
[/FILE]

For shell commands:
[SHELL]
command here
[/SHELL]

Execute in order. Start now.
`.trim();

	const MAX_RETRIES = 3;
	let attempt = 0;

	while (attempt < MAX_RETRIES) {
		attempt++;
		console.log(`\n--- 試行 ${attempt}/${MAX_RETRIES} ---`);

		// 1. LLMに生成を依頼
		const rawOutput = await llm.complete(currentPrompt);

		// 2. パースと反映 (既存のロジック)
		const pattern = /\[FILE\]\n(.*?)\n---\n([\s\S]*?)\n\[\/FILE\]|\[SHELL\]\n(.*?)\n\[\/SHELL\]/g;
		let match: RegExpExecArray | null;
		match = pattern.exec(rawOutput);
		while (match !== null) {
			const [, filePath, fileContent, shellCommand] = match;
			if (filePath) {
				await fileCreateEffect.handler({ path: filePath.trim(), content: fileContent });
			} else if (shellCommand) {
				await shellExecEffect.handler({
					command: shellCommand.trim(),
					cwd: process.cwd(),
					timeout: 60000,
				});
			}
			match = pattern.exec(rawOutput);
		}

		// 3. テスト実行 (ここを堅牢に修正)
		console.log("最終チェック (npm test) を開始します...");

		const testResponse = await shellExecEffect.handler({
			command: "npm test",
			cwd: process.cwd(),
			timeout: 60000,
		});

		if (testResponse.success) {
			console.log("✅ 全てのテストに合格しました！作業を完了します。");
			break;
		}

		// 4. 失敗時のリトライ準備
		console.error(`❌ テスト失敗 (試行 ${attempt})`);
		if (attempt >= MAX_RETRIES) {
			console.error("最大リトライ回数に達しました。");
			break;
		}

		const treeResponse = await fileListTreeEffect.handler({ path: ".", depth: 3 });
		const treeOutput = treeResponse.success ? treeResponse.data?.tree : "N/A";

		console.log("エラー内容を元に再生成を依頼します...");
		currentPrompt = `
Previous attempt failed during 'npm test'.
Please analyze the error and the directory structure, then output the FULL corrected files and commands.

[ERROR LOG]
${testResponse.data}

[CURRENT DIRECTORY TREE]
${treeOutput}

[GOAL] (Reminder)
${goalContent}

[RULE]
Output in [FILE] and [SHELL] formats again.
`.trim();
	}
}

main().catch(console.error);
