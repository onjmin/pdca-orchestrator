import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

// 入力バリデーション
export const FileTreeArgsSchema = z.object({
	path: z.string().default(".").describe("The root directory to start the tree from."),
	depth: z.number().default(3).describe("Max depth of the tree to prevent excessive output."),
});

export type FileTreeArgs = z.infer<typeof FileTreeArgsSchema>;

/**
 * 戻り値のデータ構造
 */
export interface FileTreeData {
	tree: string;
}

/**
 * EFFECT: file.tree
 * プロジェクトのディレクトリ構造を視覚化して返す。
 * エージェントが全体のファイル配置を把握するために使用する。
 */
export const tree = createEffect<FileTreeArgs, FileTreeData>({
	name: "file.tree",
	description: "Get a visual directory tree structure to understand the project layout.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string", default: "." },
			depth: { type: "number", default: 3 },
		},
	},

	handler: async (args: FileTreeArgs): Promise<EffectResponse<FileTreeData>> => {
		try {
			// 1. バリデーションと安全なパスの取得
			const { path: rootPath, depth } = FileTreeArgsSchema.parse(args);
			const safeRoot = getSafePath(rootPath);

			if (!fs.existsSync(safeRoot)) {
				return effectResult.fail(`Path not found: ${rootPath}`);
			}

			// 2. 再帰的にツリーを構築する内部関数
			const generateTree = (dir: string, currentDepth: number, prefix: string = ""): string => {
				if (currentDepth > depth) return "";

				const files = fs.readdirSync(dir, { withFileTypes: true });
				let result = "";

				// 無視するディレクトリ
				const ignoreList = [".git", "node_modules", "dist", ".next", "out"];

				const filteredFiles = files.filter((f) => !ignoreList.includes(f.name));

				filteredFiles.forEach((file, index) => {
					const isLast = index === filteredFiles.length - 1;
					const marker = isLast ? "└── " : "├── ";

					result += `${prefix}${marker}${file.name}${file.isDirectory() ? "/" : ""}\n`;

					if (file.isDirectory()) {
						const newPrefix = prefix + (isLast ? "    " : "│   ");
						result += generateTree(path.join(dir, file.name), currentDepth + 1, newPrefix);
					}
				});

				return result;
			};

			// 3. 実行
			const treeOutput = `${rootPath}/\n${generateTree(safeRoot, 1)}`;

			// 4. 成功時: tree フィールドに文字列を込める
			return effectResult.ok(`Visualized directory structure for ${rootPath}`, {
				tree: treeOutput,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to generate tree: ${errorMessage}`);
		}
	},
});
