import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const FilePwdArgsSchema = z.object({});

export type FilePwdArgs = z.infer<typeof FilePwdArgsSchema>;

/**
 * 戻り値のデータ構造
 */
export interface FilePwdData {
	base_dir: string;
	current_relative_path: string;
	note: string;
}

/**
 * EFFECT: file.pwd
 * BASE_DIR 情報を返す。
 * ok() の第2引数に FilePwdData を含めることを型で縛る。
 */
export const pwd = createEffect<FilePwdArgs, FilePwdData>({
	name: "file.pwd",
	description: "Get the current working directory path (relative to BASE_DIR).",
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},

	handler: async (): Promise<EffectResponse<FilePwdData>> => {
		try {
			const baseDir = process.env.BASE_DIR ? path.resolve(process.env.BASE_DIR) : process.cwd();

			// 成功時: FilePwdData の各プロパティを返さないと TS エラーになる
			return effectResult.ok(`You are operating within: ${baseDir}`, {
				base_dir: baseDir,
				current_relative_path: ".",
				note: "All file operations must be within this directory.",
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			// 失敗時: fail() は never を返すため、EffectResponse<FilePwdData> と適合
			return effectResult.fail(`Error getting PWD: ${errorMessage}`);
		}
	},
});
