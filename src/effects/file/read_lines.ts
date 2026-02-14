import { execSync } from "node:child_process";
import { z } from "zod";
import { createTool, type ToolResponse, toolResult } from "../types";
import { getSafePath } from "./utils";

// 1回のコールで許容する最大行数
const MAX_READ_LIMIT = 100;

export const FileReadLinesArgsSchema = z.object({
	path: z.string().describe("Path of the file to read."),
	startLine: z.number().min(1).describe("Start line number (1-indexed)."),
	endLine: z.number().min(1).describe(`End line number. Max ${MAX_READ_LIMIT} lines per call.`),
});

export type FileReadLinesArgs = z.infer<typeof FileReadLinesArgsSchema>;

export interface FileReadLinesData {
	lines: string[];
	count: number;
	isTruncated: boolean;
}

/**
 * EFFECT: file.read_lines
 * 特定の行範囲を行番号付きで読み取ります。
 */
export const fileReadLinesEffect = createTool<FileReadLinesArgs, FileReadLinesData>({
	name: "file.read_lines",
	description: "Read specific lines of a file with line numbers to examine code context.",
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
			description: `End line number (max ${MAX_READ_LIMIT} lines from start).`,
		},
	},

	handler: async (args: FileReadLinesArgs): Promise<ToolResponse<FileReadLinesData>> => {
		try {
			const { path: filePath, startLine, endLine } = FileReadLinesArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			if (startLine > endLine) {
				return toolResult.fail(
					`Invalid range: startLine (${startLine}) is greater than endLine (${endLine}).`,
				);
			}

			const requestedCount = endLine - startLine + 1;
			const isTruncated = requestedCount > MAX_READ_LIMIT;
			const effectiveEndLine = isTruncated ? startLine + MAX_READ_LIMIT - 1 : endLine;

			// cat -n で行番号を付与し、sed で抽出
			const command = `cat -n "${safePath}" | sed -n '${startLine},${effectiveEndLine}p'`;

			const stdout = execSync(command, {
				encoding: "utf8",
				timeout: 10000,
				stdio: "pipe",
			});

			const lines = stdout.split("\n").filter((line) => line.length > 0);

			const summary = isTruncated
				? `Read ${lines.length} lines (L${startLine}-L${effectiveEndLine}). [Truncated from ${requestedCount} lines]`
				: `Read ${lines.length} lines (L${startLine}-L${effectiveEndLine}).`;

			return toolResult.ok(summary, {
				lines,
				count: lines.length,
				isTruncated,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`Failed to read lines: ${errorMessage}`);
		}
	},
});
