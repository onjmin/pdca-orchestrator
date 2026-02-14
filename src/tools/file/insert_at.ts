import { promises as fs } from "node:fs";
import { z } from "zod";
import { truncateForPrompt } from "../../core/utils";
import { createTool, type ToolResponse, toolResult } from "../types";
import { getSafePath } from "./utils"; // getSafePath をインポート

export const FileInsertAtArgsSchema = z.object({
	path: z.string().describe("Path of the file."),
	atLine: z.number().min(1).describe("The line number to insert at."),
	insertText: z.string().describe("The text to insert."),
});

export type FileInsertAtArgs = z.infer<typeof FileInsertAtArgsSchema>;

export const fileInsertAtTool = createTool<FileInsertAtArgs, { path: string }>({
	name: "file.insert_at",
	description: "Insert text at a specific line number without deleting existing content.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path.",
		},
		atLine: {
			type: "number",
			description: "Line number where the text will be inserted (1-indexed).",
		},
		insertText: {
			type: "string",
			description: "Text to insert at the specified line.",
			isRawData: true,
		},
	},
	handler: async (args: FileInsertAtArgs): Promise<ToolResponse<{ path: string }>> => {
		try {
			const { path: filePath, atLine, insertText } = FileInsertAtArgsSchema.parse(args);

			const safeAbsolutePath = getSafePath(filePath);

			const content = await fs.readFile(safeAbsolutePath, "utf-8");
			const lines = content.split(/\r?\n/);

			const targetIndex = Math.min(atLine - 1, lines.length);
			lines.splice(targetIndex, 0, insertText);

			await fs.writeFile(safeAbsolutePath, lines.join("\n"), "utf-8");

			const previewStart = Math.max(0, atLine - 1);
			const previewEnd = Math.min(lines.length, atLine + 1);
			const preview = lines.slice(previewStart, previewEnd).join("\n");

			return toolResult.ok(
				`Successfully inserted text into ${filePath} at line ${atLine}.\n` +
					`Context Snapshot:\n---\n${truncateForPrompt(preview, 200)}\n---`,
				{ path: filePath },
			);
		} catch (err) {
			return toolResult.fail(
				`Insertion failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	},
});
