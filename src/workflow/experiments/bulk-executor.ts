import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { llm } from "../../core/llm-client"; // 提示いただいたLLMモジュール
import { fileCreateEffect } from "../../effects/file/create";
import { getSafePath } from "../../effects/file/utils";
import { shellExecEffect } from "../../effects/shell/exec";

async function main() {
	console.log("--- 職人が起きました（一括実行モード） ---");

	// 1. ゴールの読み込み
	const goalPath = resolve(process.cwd(), "GOAL.md");
	let goalContent = "";
	try {
		goalContent = await fs.readFile(goalPath, "utf-8");
	} catch {
		console.error("GOAL.md が見つかりません。");
		return;
	}

	// 2. プロンプトの構築
	const prompt = `
You are an expert developer. Based on the GOAL below, output ALL necessary file creations and shell commands to complete the task at once.

[GOAL]
${goalContent}

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

	// 3. LLMに一括リクエスト
	console.log("LLMが思考中...");
	const rawOutput = await llm.complete(prompt);

	// 掃除
	const baseDir = getSafePath(".");
	console.log(`Working Directory: ${baseDir}`);
	try {
		// BASE_DIR の中身を再帰的に削除
		const files = await fs.readdir(baseDir);
		for (const file of files) {
			const target = resolve(baseDir, file);
			await fs.rm(target, { recursive: true, force: true });
		}
		console.log("🧹 ワークスペースを掃除しました。");
	} catch (err) {
		console.warn("⚠️ 掃除中にエラーが発生しました（無視して続行します）:", err);
	}

	// 4. 正規表現によるパースと順次実行
	// [FILE]パス\n---\n内容[/FILE] または [SHELL]コマンド[/SHELL]
	const pattern = /\[FILE\]\n(.*?)\n---\n([\s\S]*?)\n\[\/FILE\]|\[SHELL\]\n(.*?)\n\[\/SHELL\]/g;

	let stepCount = 0;

	// match の型を明示して noImplicitAnyLet を回避
	let match: RegExpExecArray | null;

	// noAssignInExpressions を回避するために while の外で初回実行
	match = pattern.exec(rawOutput);

	while (match !== null) {
		stepCount++;

		// 分割代入を使って可読性を向上
		// match[1]: filePath, match[2]: fileContent, match[3]: shellCommand
		const [, filePath, fileContent, shellCommand] = match;

		if (filePath) {
			console.log(`[Step ${stepCount}] Creating: ${filePath.trim()}`);
			await fileCreateEffect.handler({
				path: filePath.trim(),
				content: fileContent,
			});
		} else if (shellCommand) {
			console.log(`[Step ${stepCount}] Executing: ${shellCommand.trim()}`);
			await shellExecEffect.handler({
				command: shellCommand.trim(),
				cwd: getSafePath("."),
				timeout: 60000, // 1分でタイムアウト（必要に応じて調整）
			});
		}

		// 次のマッチを取得（ループの最後で更新）
		match = pattern.exec(rawOutput);
	}

	if (stepCount === 0) {
		console.log("実行可能な手順が見つかりませんでした。出力内容を確認してください。");
		console.log("--- RAW OUTPUT ---");
		console.log(rawOutput);
	} else {
		console.log(`--- 全${stepCount}工程、完了しました ---`);
	}
}

main().catch(console.error);
