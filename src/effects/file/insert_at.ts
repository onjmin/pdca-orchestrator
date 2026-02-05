import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const FileInsertAtArgsSchema = z.object({
	path: z.string().describe("Path of the file."),
	atLine: z.number().min(1).describe("The line number to insert at."),
	insertText: z.string().describe("The text to insert."),
});

export type FileInsertAtArgs = z.infer<typeof FileInsertAtArgsSchema>;

export const insertAt = createEffect<FileInsertAtArgs, { path: string }>({
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
			const { path, atLine, insertText } = FileInsertAtArgsSchema.parse(args);
			const absolutePath = resolve(process.cwd(), path);
			const content = await fs.readFile(absolutePath, "utf-8");
			const lines = content.split(/\r?\n/);

			const targetIndex = Math.min(atLine - 1, lines.length);
			lines.splice(targetIndex, 0, insertText);

			await fs.writeFile(absolutePath, lines.join("\n"), "utf-8");
			return effectResult.ok(`Inserted text at ${path}:L${atLine}.`, { path });
		} catch (err) {
			return effectResult.fail(
				`Insertion failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	},
});
