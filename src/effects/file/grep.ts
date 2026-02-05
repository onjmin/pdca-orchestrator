import { execSync } from "node:child_process";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileGrepArgsSchema = z.object({
	path: z.string().describe("Path to search in."),
	pattern_placeholder: z
		.string()
		.describe("MANDATORY: Write ONLY '__DATA__' here. The actual pattern will be injected."),
	recursive: z.boolean().default(true).describe("Search recursively through directories."),
});

export type FileGrepArgs = z.infer<typeof FileGrepArgsSchema>;

/**
 * レスポンスのデータ構造
 */
export interface FileGrepData {
	results: string[];
}

/**
 * EFFECT: file.grep
 * システムの grep コマンドを使用してパターンを高速検索する。
 * ヒットなし(status 1)の場合も空配列を返すのが正常系。
 */
export const grep = createEffect<FileGrepArgs, FileGrepData>({
	name: "file.grep",
	description:
		"Search for patterns within files or directories. Provides line numbers and surrounding context (-C 3) to help locate code quickly. Use this to identify targets for inspection or modification.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string" },
			pattern_placeholder: { type: "string" },
			recursive: { type: "boolean" },
		},
		required: ["path", "pattern_placeholder"],
	},

	handler: async (args: FileGrepArgs): Promise<EffectResponse<FileGrepData>> => {
		try {
			const { path: searchPath, pattern_placeholder, recursive } = FileGrepArgsSchema.parse(args);
			const safePath = getSafePath(searchPath);

			// -C 3 を追加して、前後の3行ずつ（計7行分）を表示させる
			const flags = recursive ? "-rnIEC 3" : "-nIEC 3";
			const escapedPattern = pattern_placeholder.replace(/"/g, '\\"');
			const command = `grep ${flags} --no-group-separator "${escapedPattern}" "${safePath}"`;

			const stdout = execSync(command, {
				encoding: "utf8",
				timeout: 10000,
				stdio: "pipe",
			});

			const results = stdout.split("\n").filter((line) => line.length > 0);

			// 成功時: results を含む FileGrepData を返す
			return effectResult.ok(`Found ${results.length} matches.`, {
				results: results.slice(0, 30), // AIが混乱しないよう上限を設定
			});
		} catch (err: unknown) {
			// grep 特有の挙動: ヒットなしは exit code 1
			if (err && typeof err === "object" && (err as { status?: number }).status === 1) {
				return effectResult.ok("No matches found.", { results: [] });
			}

			const errorMessage = err instanceof Error ? err.message : String(err);
			// 失敗時: never 型により自動適合
			return effectResult.fail(`Grep execution error: ${errorMessage}`);
		}
	},
});
