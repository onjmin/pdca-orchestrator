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
 * ファイル内の特定の文字列を新しい内容で置換する。
 * 大規模なファイルの特定箇所のみを修正する場合に、トークン効率と安全性を高めるために使用。
 */
export const patch = createEffect<FilePatchArgs, { path: string }>({
	name: "file.patch",
	description:
		"Apply changes to a file. Prerequisite: You must have already inspected the target lines using 'file.read_lines'. Using this tool without prior inspection is a violation of the workflow.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string" },
			search: { type: "string" },
			replace: { type: "string" },
		},
		required: ["path", "search", "replace"],
	},

	handler: async (args: FilePatchArgs): Promise<EffectResponse<{ path: string }>> => {
		try {
			const { path, search, replace } = FilePatchArgsSchema.parse(args);
			const absolutePath = resolve(process.cwd(), path);

			// ファイルの存在確認
			const content = await fs.readFile(absolutePath, "utf-8");

			// 置換対象が含まれているかチェック
			if (!content.includes(search)) {
				return effectResult.fail(
					`The exact search string was not found in ${path}. ` +
						`Make sure the indentation and whitespace match exactly.`,
				);
			}

			// 置換実行（最初に見つかった1箇所のみ置換。複数箇所ある場合はLLMに再度実行させるのが安全）
			const newContent = content.replace(search, replace);

			await fs.writeFile(absolutePath, newContent, "utf-8");

			return effectResult.ok(`Successfully patched ${path}.`, { path });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`File patch failed: ${errorMessage}`);
		}
	},
});
