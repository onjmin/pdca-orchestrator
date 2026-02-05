import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const FilePatchArgsSchema = z.object({
	path: z.string().describe("The path to the file to be patched."),
	search: z
		.string()
		.describe("The exact string to be replaced. Must match exactly including indentation."),
	replace: z.string().describe("The new string to replace the 'search' string with."),
});

export type FilePatchArgs = z.infer<typeof FilePatchArgsSchema>;

/**
 * EFFECT: file.patch
 * ファイル内の特定の文字列を新しい内容で置換します。
 */
export const patch = createEffect<FilePatchArgs, { path: string }>({
	name: "file.patch",
	description:
		"Replace a specific string in a file with new content. Ensure the 'search' string matches the target exactly.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path.",
		},
		search: {
			type: "string",
			description: "Exact string to be replaced (including indentation).",
			isRawData: true, // STEP 3 で精密に取得
		},
		replace: {
			type: "string",
			description: "New content to insert.",
			isRawData: true, // STEP 3 で精密に取得
		},
	},

	handler: async (args: FilePatchArgs): Promise<EffectResponse<{ path: string }>> => {
		try {
			const { path, search, replace } = FilePatchArgsSchema.parse(args);
			const absolutePath = resolve(process.cwd(), path);

			// ファイルの存在確認と読み込み
			const content = await fs.readFile(absolutePath, "utf-8");

			// 置換対象が含まれているかチェック
			if (!content.includes(search)) {
				return effectResult.fail(
					`The exact search string was not found in ${path}. ` +
						`Indentation and whitespace must match exactly.`,
				);
			}

			// 最初に見つかった箇所を置換
			const newContent = content.replace(search, replace);

			await fs.writeFile(absolutePath, newContent, "utf-8");

			return effectResult.ok(`Successfully patched ${path}.`, { path });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`File patch failed: ${errorMessage}`);
		}
	},
});
