import { promises as fs } from "node:fs";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils"; // getSafePath をインポート

export const FileInsertAtArgsSchema = z.object({
	path: z.string().describe("Path of the file."),
	atLine: z.number().min(1).describe("The line number to insert at."),
	insertText: z.string().describe("The text to insert."),
});

export type FileInsertAtArgs = z.infer<typeof FileInsertAtArgsSchema>;

export const fileInsertAtEffect = createEffect<FileInsertAtArgs, { path: string }>({
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
	handler: async (args: FileInsertAtArgs): Promise<EffectResponse<{ path: string }>> => {
		try {
			const { path: filePath, atLine, insertText } = FileInsertAtArgsSchema.parse(args);

			const safeAbsolutePath = getSafePath(filePath);

			const content = await fs.readFile(safeAbsolutePath, "utf-8");
			const lines = content.split(/\r?\n/);

			const targetIndex = Math.min(atLine - 1, lines.length);
			lines.splice(targetIndex, 0, insertText);

			await fs.writeFile(safeAbsolutePath, lines.join("\n"), "utf-8");

			return effectResult.ok(`Inserted text at ${filePath}:L${atLine}.`, { path: filePath });
		} catch (err) {
			return effectResult.fail(
				`Insertion failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	},
});
