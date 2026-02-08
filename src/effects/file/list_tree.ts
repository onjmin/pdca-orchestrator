import { execSync } from "node:child_process";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileListTreeArgsSchema = z.object({
	path: z.string().default(".").describe("Root directory to list the tree from."),
	depth: z.number().min(1).max(5).default(3).describe("Max depth of the directory tree."),
});

export type FileListTreeArgs = z.infer<typeof FileListTreeArgsSchema>;

export interface FileListTreeData {
	tree: string;
}

/**
 * EFFECT: file.list_tree
 * tree コマンドを使用してディレクトリ構造を視覚化します。
 */
export const fileListTreeEffect = createEffect<FileListTreeArgs, FileListTreeData>({
	name: "file.list_tree",
	description: "Get the visual tree structure of the workspace using the 'tree' command.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target directory path.",
		},
		depth: {
			type: "number",
			description: "Maximum depth level (1-5).",
		},
	},

	handler: async (args: FileListTreeArgs): Promise<EffectResponse<FileListTreeData>> => {
		try {
			const { path: rootPath, depth } = FileListTreeArgsSchema.parse(args);
			const safePath = getSafePath(rootPath);

			// node_modules や .git など、AIに不要な巨大ディレクトリを除外して実行
			const excludePattern = "node_modules|.git|dist|build|.next";
			const command = `tree -L ${depth} -I "${excludePattern}" --noreport "${safePath}"`;

			const treeOutput = execSync(command, {
				encoding: "utf8",
				timeout: 5000,
				stdio: "pipe",
			});

			return effectResult.ok(`Project tree for ${rootPath} (depth: ${depth})`, {
				tree: treeOutput,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Failed to execute tree command: ${errorMessage}`);
		}
	},
});
