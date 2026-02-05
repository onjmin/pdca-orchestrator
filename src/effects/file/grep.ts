import { execSync } from "node:child_process";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileGrepArgsSchema = z.object({
	path: z.string().describe("Path to search in (file or directory)."),
	pattern: z.string().describe("The search pattern or string."),
	recursive: z.boolean().describe("Search recursively through directories."),
});

export type FileGrepArgs = z.infer<typeof FileGrepArgsSchema>;

export interface FileGrepData {
	results: string[];
}

/**
 * EFFECT: file.grep
 * システムの grep コマンドを使用してパターンを高速検索します。
 */
export const grep = createEffect<FileGrepArgs, FileGrepData>({
	name: "file.grep",
	description:
		"Search for patterns within files. Provides line numbers and context to help locate code.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target path to search.",
		},
		pattern: {
			type: "string",
			description: "The pattern to search for.",
			isRawData: true, // 特殊文字やクォートが含まれる可能性があるため STEP 3 で注入
		},
		recursive: {
			type: "boolean",
			description: "Enable recursive search.",
		},
	},

	handler: async (args: FileGrepArgs): Promise<EffectResponse<FileGrepData>> => {
		try {
			const { path: searchPath, pattern, recursive } = FileGrepArgsSchema.parse(args);
			const safePath = getSafePath(searchPath);

			// -C 3 で前後の文脈を含める
			const flags = recursive ? "-rnIEC 3" : "-nIEC 3";

			// シェルのメタ文字を考慮してシングルクォートで囲む（簡易版）
			const escapedPattern = pattern.replace(/'/g, "'\\''");
			const command = `grep ${flags} --no-group-separator '${escapedPattern}' "${safePath}"`;

			const stdout = execSync(command, {
				encoding: "utf8",
				timeout: 10000,
				stdio: "pipe",
			});

			const results = stdout.split("\n").filter((line) => line.length > 0);

			return effectResult.ok(`Found ${results.length} matches.`, {
				results: results.slice(0, 30), // トークン節約のため上限を設定
			});
		} catch (err: unknown) {
			// grep: 1 は「ヒットなし」を意味する正常な終了コード
			if (err && typeof err === "object" && (err as { status?: number }).status === 1) {
				return effectResult.ok("No matches found.", { results: [] });
			}

			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Grep execution error: ${errorMessage}`);
		}
	},
});
