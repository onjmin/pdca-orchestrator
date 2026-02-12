import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { truncateForPrompt } from "../../core/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileCreateArgsSchema = z.object({
	path: z.string().describe("Target file path to create."),
	content: z.string().describe("The full content of the file."),
});

export type FileCreateArgs = z.infer<typeof FileCreateArgsSchema>;

/**
 * EFFECT: file.create
 * ファイルの新規作成を行います。既存ファイルの上書きは禁止します。
 */
export const fileCreateEffect = createEffect<FileCreateArgs, void>({
	name: "file.create",
	description:
		"Create a NEW file with the specified content. This effect will FAIL if the file already exists. To modify existing files, use 'file.patch' instead. Parent directories are created automatically.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path (must not exist).",
		},
		content: {
			type: "string",
			description: "The complete raw content to be written to the file.",
			isRawData: true,
		},
	},

	handler: async (args: FileCreateArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: filePath, content } = FileCreateArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 既存ファイルチェック：上書きを物理的に阻止する
			if (fs.existsSync(safePath)) {
				return effectResult.fail(
					`File "${filePath}" ALREADY EXISTS. Overwriting is forbidden with 'file.create'. ` +
						`Please use 'file.patch' to modify this file, or delete it first if a complete recreate is truly necessary.`,
				);
			}

			fs.mkdirSync(path.dirname(safePath), { recursive: true });
			fs.writeFileSync(safePath, content, "utf8");

			const stats = fs.statSync(safePath);
			const lines = content.split("\n");

			const summary = [
				`Successfully CREATED: ${filePath}`,
				`Size: ${stats.size} bytes`,
				`Lines: ${lines.length}`,
				`Content Snapshot:`,
				"---",
				truncateForPrompt(content, 200),
				"---",
			].join("\n");

			return effectResult.okVoid(summary);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Create error: ${errorMessage}`);
		}
	},
});
