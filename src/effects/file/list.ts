import fs from "node:fs";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileListArgsSchema = z.object({
	path: z.string().describe("Target directory path (default: '.')"),
});

export type FileListArgs = z.infer<typeof FileListArgsSchema>;

/**
 * 戻り値のデータ構造を定義
 */
export interface FileListData {
	items: string[];
}

/**
 * EFFECT: file.list
 * 指定されたディレクトリ内のアイテム一覧を返す。
 * ok() の第2引数に items を含むオブジェクトを強制する。
 */
export const list = createEffect<FileListArgs, FileListData>({
	name: "file.list",
	description: "List files and directories in a given path.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string", description: "Directory path." },
		},
		required: ["path"],
	},

	handler: async (args: FileListArgs): Promise<EffectResponse<FileListData>> => {
		try {
			const { path: dirPath } = FileListArgsSchema.parse(args);
			const safePath = getSafePath(dirPath || ".");

			if (!fs.existsSync(safePath)) {
				// fail は never を返すため、EffectResponse<FileListData> に適合
				return effectResult.fail(`Directory not found: ${dirPath}`);
			}

			const files = fs.readdirSync(safePath, { withFileTypes: true });
			const items = files.map((f) => `${f.isDirectory() ? "[DIR] " : "[FILE]"} ${f.name}`);

			// 成功時: FileListData 型のデータを必須にする
			return effectResult.ok(`Listed ${items.length} items in ${dirPath}`, { items });
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`List error: ${errorMessage}`);
		}
	},
});
