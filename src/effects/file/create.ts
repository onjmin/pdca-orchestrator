import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileCreateArgsSchema = z.object({
	path: z.string().describe("Target file path to create."),
	content: z.string().describe("The full content of the file."),
});

export type FileCreateArgs = z.infer<typeof FileCreateArgsSchema>;

/**
 * EFFECT: file.create
 * ファイルの新規作成、または全文上書きを行います。
 * 親ディレクトリが存在しない場合は自動的に作成します。
 */
export const create = createEffect<FileCreateArgs, void>({
	name: "file.create",
	description:
		"Create a file with the specified content. If the file already exists, it will be completely overwritten. Parent directories are created automatically.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path.",
		},
		content: {
			type: "string",
			description: "The complete raw content to be written to the file.",
			isRawData: true,
		},
	},

	handler: async (args: FileCreateArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: filePath, content } = FileCreateArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 書き込み前に存在確認
			const isNewFile = !fs.existsSync(safePath);

			// ディレクトリを再帰的に作成
			fs.mkdirSync(path.dirname(safePath), { recursive: true });

			// 内容を書き込み
			fs.writeFileSync(safePath, content, "utf8");

			return effectResult.okVoid(
				isNewFile
					? `Successfully created a new file at: ${filePath}`
					: `Successfully updated the file at: ${filePath}. (Note: Full overwrite performed)`,
			);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Create error: ${errorMessage}`);
		}
	},
});
