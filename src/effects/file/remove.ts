import fs from "node:fs";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileRemoveArgsSchema = z.object({
	path: z.string().describe("The path of the file or directory to remove."),
	recursive: z
		.boolean()
		.default(false)
		.describe("Whether to remove transitively if the path is a directory."),
});

export type FileRemoveArgs = z.infer<typeof FileRemoveArgsSchema>;

/**
 * EFFECT: file.remove
 * ファイルまたはディレクトリを安全に削除する。
 */
export const remove = createEffect<FileRemoveArgs, void>({
	name: "file.remove",
	description:
		"Remove a file or directory safely within the project. Use recursive:true for non-empty directories.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "Path to the file or directory.",
			},
			recursive: {
				type: "boolean",
				default: false,
				description: "If true, remove directories and their contents recursively.",
			},
		},
		required: ["path"],
	},

	handler: async (args: FileRemoveArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: targetPath, recursive } = FileRemoveArgsSchema.parse(args);
			const safePath = getSafePath(targetPath);

			if (!fs.existsSync(safePath)) {
				return effectResult.fail(`Path not found: ${targetPath}`);
			}

			// 2. 削除実行
			fs.rmSync(safePath, {
				recursive: recursive,
				force: true,
			});

			return effectResult.okVoid(`Successfully removed: ${targetPath}`);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to remove path: ${errorMessage}`);
		}
	},
});
