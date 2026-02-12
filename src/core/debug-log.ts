import fs from "node:fs";
import path from "node:path";

let currentTurn = 1;
const BASE_LOG_DIR = path.join(process.cwd(), "logs");

export const isDebugMode = process.env.DEBUG_MODE === "1";

/**
 * ログ環境を初期化する
 * logsディレクトリを削除し、ターンを1にリセットする
 */
export async function initDebugLog() {
	if (!isDebugMode) return;

	try {
		if (fs.existsSync(BASE_LOG_DIR)) {
			await fs.promises.rm(BASE_LOG_DIR, { recursive: true, force: true });
		}
		// ターンを強制的に1にリセット (副作用)
		currentTurn = 1;
	} catch (error) {
		console.error("Failed to initialize debug logs:", error);
	}
}

/**
 * ターンの数値を設定する
 */
export function setLogTurn(n: number) {
	currentTurn = n;
}

/**
 * ログを md 形式で保存する
 * 構造: logs/turn001/{fileName}.md
 */
export async function savePromptLog(fileName: string, prompt: string) {
	if (!isDebugMode) return;

	try {
		const turnDirName = `turn${String(currentTurn).padStart(3, "0")}`;
		const targetDir = path.join(BASE_LOG_DIR, turnDirName);

		if (!fs.existsSync(targetDir)) {
			await fs.promises.mkdir(targetDir, { recursive: true });
		}

		const filePath = path.join(targetDir, `${fileName}.md`);
		await fs.promises.writeFile(filePath, prompt, "utf8");
	} catch (error) {
		console.error(`Failed to save log: ${fileName}`, error);
	}
}
