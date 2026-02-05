import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileCreateArgsSchema = z.object({
	path: z.string().describe("Target file path to create."),
	// データ注入用のプレースホルダー。AIには'__DATA__'と書かせる
	raw_content_placeholder: z
		.string()
		.describe("MANDATORY: Write ONLY '__DATA__' here. The actual content will be injected."),
});

export type FileCreateArgs = z.infer<typeof FileCreateArgsSchema>;

/**
 * EFFECT: file.create
 * ファイルの新規作成、または全文上書きを行います。
 * AIには「新規作成用」と認識させ、既存修正は patch へ誘導します。
 */
export const create = createEffect<FileCreateArgs, void>({
	name: "file.create",
	description:
		"Create a file with the specified content. If the file already exists, it will be completely overwritten. Automatically creates parent directories if they do not exist.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string", description: "Target file path." },
			raw_content_placeholder: {
				type: "string",
				description: "Write ONLY '__DATA__' here.",
			},
		},
		required: ["path", "raw_content_placeholder"],
	},

	handler: async (args: FileCreateArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: filePath, raw_content_placeholder } = FileCreateArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 書き込み前に存在確認（レスポンスメッセージの分岐用）
			const isNewFile = !fs.existsSync(safePath);

			// ディレクトリが存在しない場合は再帰的に作成
			fs.mkdirSync(path.dirname(safePath), { recursive: true });

			// プレースホルダーの位置に実際の内容が注入されている前提で書き込み
			fs.writeFileSync(safePath, raw_content_placeholder, "utf8");

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
