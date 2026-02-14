import { promises as fs } from "node:fs";
import { z } from "zod";
import { truncateForPrompt } from "../../core/utils";
import { createTool, type ToolResponse, toolResult } from "../types";
import { getSafePath } from "./utils"; // getSafePath をインポート

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
export const filePatchTool = createTool<FilePatchArgs, { path: string }>({
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

	handler: async (args: FilePatchArgs): Promise<ToolResponse<{ path: string }>> => {
		try {
			const { path: filePath, startLine, endLine, insertText } = FilePatchArgsSchema.parse(args);

			const safeAbsolutePath = getSafePath(filePath);

			if (startLine > endLine) {
				return toolResult.fail(`Invalid range: startLine (${startLine}) > endLine (${endLine})`);
			}

			const content = await fs.readFile(safeAbsolutePath, "utf-8");
			const lines = content.split(/\r?\n/);

			// バリデーション: 指定された行がファイル内に存在するか
			if (startLine > lines.length) {
				return toolResult.fail(`Start line ${startLine} exceeds file length (${lines.length}).`);
			}

			// 行の置換処理
			// 1-indexed を 0-indexed に調整
			const deleteCount = endLine - startLine + 1;
			lines.splice(startLine - 1, deleteCount, insertText);

			const newContent = lines.join("\n");
			await fs.writeFile(safeAbsolutePath, newContent, "utf-8");

			// AIを安心させるためのパッチ後のスナップショットを作成
			// 置換した位置の周辺（前後1行ずつなど）を見せるのが理想的
			const contextStart = Math.max(0, startLine - 2);
			const contextEnd = startLine; // 置換した部分の先頭付近
			const previewLines = lines.slice(contextStart, contextEnd + 1);
			const preview = previewLines.join("\n");

			return toolResult.ok(
				`Successfully patched ${filePath} (L${startLine}-L${endLine} replaced).\n` +
					`New Content Snapshot around L${startLine}:\n---\n${truncateForPrompt(preview, 200)}\n---`,
				{
					path: filePath,
				},
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`File patch failed: ${errorMessage}`);
		}
	},
});
