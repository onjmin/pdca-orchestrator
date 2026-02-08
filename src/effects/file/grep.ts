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
export const fileGrepEffect = createEffect<FileGrepArgs, FileGrepData>({
	name: "file.grep",
	description:
		"Search for patterns with context. Results include line numbers and surrounding lines.",
	inputSchema: {
		path: { type: "string", description: "Target path to search." },
		pattern: { type: "string", description: "The pattern to search for.", isRawData: true },
		recursive: { type: "boolean", description: "Enable recursive search." },
	},

	handler: async (args: FileGrepArgs): Promise<EffectResponse<FileGrepData>> => {
		try {
			const { path: searchPath, pattern, recursive } = FileGrepArgsSchema.parse(args);
			const safePath = getSafePath(searchPath);

			/**
			 * 現行維持 + 堅牢性向上:
			 * -C 3: 前後3行のコンテキストを表示（現行維持）
			 * -n: 行番号を表示
			 * -H: 必ずファイル名を表示（追加：フォーマットの一貫性のため）
			 * -I: バイナリ無視
			 * --no-group-separator: ヒット間の '--' 区切りを消してリストを扱いやすくする
			 */
			const flags = recursive ? "-rnIHC 3" : "-nIHC 3";

			const escapedPattern = pattern.replace(/'/g, "'\\''");
			const command = `grep ${flags} --no-group-separator '${escapedPattern}' "${safePath}"`;

			const stdout = execSync(command, {
				encoding: "utf8",
				timeout: 15000,
				stdio: "pipe",
			});

			const results = stdout
				.split("\n")
				.filter((line) => line.length > 0)
				.slice(0, 50);

			return effectResult.ok(`Found ${results.length} lines of matches and context.`, {
				results: results,
			});
		} catch (err: unknown) {
			if (err instanceof Error && "status" in err && err.status === 1) {
				return effectResult.ok("No matches found.", { results: [] });
			}
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Grep error: ${errorMessage}`);
		}
	},
});
