import fs from "node:fs";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

// 入力バリデーション
export const FileReadArgsSchema = z.object({
	path: z.string().describe("The path of the file to read."),
	encoding: z.string().default("utf8").describe("File encoding (default: utf8)."),
});

export type FileReadArgs = z.infer<typeof FileReadArgsSchema>;

/**
 * 戻り値のデータ構造
 */
export interface FileReadData {
	content: string;
}

/**
 * EFFECT: file.read
 * ファイルの内容を読み取る。
 * shell.exec(cat) よりも安全で、型安全な content を返す。
 */
export const read = createEffect<FileReadArgs, FileReadData>({
	name: "file.read",
	description: "Read the content of a file. Returns the raw text content.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string" },
			encoding: { type: "string", default: "utf8" },
		},
		required: ["path"],
	},

	handler: async (args: FileReadArgs): Promise<EffectResponse<FileReadData>> => {
		try {
			// 1. バリデーションと安全なパスの取得
			const { path: filePath, encoding } = FileReadArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 2. 存在確認
			if (!fs.existsSync(safePath)) {
				return effectResult.fail(`File not found: ${filePath}`);
			}

			// ディレクトリでないかチェック
			const stats = fs.statSync(safePath);
			if (stats.isDirectory()) {
				return effectResult.fail(`Path is a directory, not a file: ${filePath}`);
			}

			// 3. サイズ制限（例: 500KB以上のファイルは読み込まない）
			const MAX_SIZE = 500 * 1024;
			if (stats.size > MAX_SIZE) {
				return effectResult.fail(
					`File is too large (${stats.size} bytes). Max limit is ${MAX_SIZE} bytes.`,
				);
			}

			// 4. 読み取り実行
			const content = fs.readFileSync(safePath, { encoding: encoding as BufferEncoding });

			// 5. 成功時: content を含む構造を強制
			return effectResult.ok(`Read ${content.length} characters from ${filePath}`, { content });
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to read file: ${errorMessage}`);
		}
	},
});
