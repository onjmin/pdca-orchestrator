import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const FilePatchArgsSchema = z.object({
	path: z.string().describe("Path of the file to patch."),
	startLine: z.number().min(1).describe("The starting line number to replace (inclusive)."),
	endLine: z.number().min(1).describe("The ending line number to replace (inclusive)."),
	insertText: z.string().describe("The new content to insert into the specified line range."),
});

export type FilePatchArgs = z.infer<typeof FilePatchArgsSchema>;

/**
 * EFFECT: file.patch
 * 指定された行範囲 (startLine-endLine) を新しい内容で置換します。
 */
export const patch = createEffect<FilePatchArgs, { path: string }>({
	name: "file.patch",
	description:
		"Replace a specific line range in a file with new content. Use read_lines first to identify line numbers.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path.",
		},
		startLine: {
			type: "number",
			description: "Start line number (1-indexed).",
		},
		endLine: {
			type: "number",
			description: "End line number (1-indexed).",
		},
		insertText: {
			type: "string",
			description: "New content (can be multiple lines).",
			isRawData: true,
		},
	},

	handler: async (args: FilePatchArgs): Promise<EffectResponse<{ path: string }>> => {
		try {
			const { path, startLine, endLine, insertText } = FilePatchArgsSchema.parse(args);
			const absolutePath = resolve(process.cwd(), path);

			if (startLine > endLine) {
				return effectResult.fail(`Invalid range: startLine (${startLine}) > endLine (${endLine})`);
			}

			const content = await fs.readFile(absolutePath, "utf-8");
			const lines = content.split(/\r?\n/);

			// バリデーション: 指定された行がファイル内に存在するか
			if (startLine > lines.length) {
				return effectResult.fail(`Start line ${startLine} exceeds file length (${lines.length}).`);
			}

			// 行の置換処理
			// splice(開始インデックス, 削除する要素数, 追加する要素)
			// 1-indexed を 0-indexed に調整
			const deleteCount = endLine - startLine + 1;
			lines.splice(startLine - 1, deleteCount, insertText);

			const newContent = lines.join("\n");
			await fs.writeFile(absolutePath, newContent, "utf-8");

			return effectResult.ok(`Successfully patched ${path} (L${startLine}-L${endLine} replaced).`, {
				path,
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`File patch failed: ${errorMessage}`);
		}
	},
});
