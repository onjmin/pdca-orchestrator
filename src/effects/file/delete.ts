import fs from "node:fs";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileDeleteArgsSchema = z.object({
	path: z.string().describe("The path of the file or directory to delete."),
	recursive: z
		.boolean()
		.default(false)
		.describe("Whether to delete transitively if the path is a directory."),
});

export type FileDeleteArgs = z.infer<typeof FileDeleteArgsSchema>;

/**
 * EFFECT: file.delete
 * ファイルまたはディレクトリを安全に削除する。
 * 戻り値データは不要なため EffectResponse<void> を約束する。
 */
export const remove = createEffect<FileDeleteArgs, void>({
	name: "file.delete",
	description:
		"Delete a file or directory safely within the project. Use recursive:true for non-empty directories.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string" },
			recursive: { type: "boolean", default: false },
		},
		required: ["path"],
	},

	handler: async (args: FileDeleteArgs): Promise<EffectResponse<void>> => {
		try {
			// 1. バリデーション
			const { path: targetPath, recursive } = FileDeleteArgsSchema.parse(args);
			const safePath = getSafePath(targetPath);

			if (!fs.existsSync(safePath)) {
				// fail は EffectResponse<never> なので void 型に適合
				return effectResult.fail(`Path not found: ${targetPath}`);
			}

			// 2. 削除実行
			fs.rmSync(safePath, {
				recursive: recursive,
				force: true, // 存在しない場合のエラーを抑制（既出チェック済みだが念のため）
			});

			// 3. 成功時: okVoid で data: undefined を確定
			return effectResult.okVoid(`Successfully deleted: ${targetPath}`);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to delete path: ${errorMessage}`);
		}
	},
});
