import { execSync } from "node:child_process";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

// 1回のコールで許容する最大行数。プロンプトのコンテキスト維持のため100行に設定。
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
 * sedを使用して特定の行範囲を読み取ります。
 * 全文読み込みを避け、AIのコンテキスト消費を抑えながら精査を行うためのツールです。
 */
export const readLines = createEffect<FileReadLinesArgs, FileReadLinesData>({
	name: "file.read_lines",
	description:
		"Read specific lines (max 100). Mandatory step after 'file.grep' and BEFORE any write/patch operations. Ensure you understand the full logic by seeing the actual line numbers and context.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string" },
			startLine: { type: "number" },
			endLine: { type: "number" },
		},
		required: ["path", "startLine", "endLine"],
	},

	handler: async (args: FileReadLinesArgs): Promise<EffectResponse<FileReadLinesData>> => {
		try {
			const { path: filePath, startLine, endLine } = FileReadLinesArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 1. 範囲のバリデーション
			if (startLine > endLine) {
				return effectResult.fail(
					`Invalid range: startLine (${startLine}) is greater than endLine (${endLine}).`,
				);
			}

			// 2. 読み取り範囲の強制制限
			const requestedCount = endLine - startLine + 1;
			const isTruncated = requestedCount > MAX_READ_LIMIT;
			const effectiveEndLine = isTruncated ? startLine + MAX_READ_LIMIT - 1 : endLine;

			// 3. cat -n で行番号を付与し、sed で範囲抽出
			// AIが行番号を正確に把握できるよう cat -n を併用
			const command = `cat -n "${safePath}" | sed -n '${startLine},${effectiveEndLine}p'`;

			const stdout = execSync(command, {
				encoding: "utf8",
				timeout: 10000,
				stdio: "pipe",
			});

			const lines = stdout.split("\n").filter((line) => line.length > 0);

			// 4. 結果のサマリー作成
			const summary = isTruncated
				? `Read ${lines.length} lines from ${filePath} (L${startLine}-L${effectiveEndLine}). [NOTICE: Requested range was ${requestedCount} lines, but truncated to ${MAX_READ_LIMIT} for context safety.]`
				: `Read ${lines.length} lines from ${filePath} (L${startLine}-L${effectiveEndLine}).`;

			return effectResult.ok(summary, {
				lines,
				count: lines.length,
				isTruncated,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to read lines: ${errorMessage}`);
		}
	},
});
