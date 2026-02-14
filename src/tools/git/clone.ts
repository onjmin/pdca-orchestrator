import { execSync } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createTool, type ToolResponse, toolResult } from "../types";

export const GitCloneArgsSchema = z.object({
	repository: z.string().describe("The GitHub repository URL or 'owner/repo' format."),
	recursive: z.boolean().describe("Whether to clone submodules."),
});

export type GitCloneArgs = z.infer<typeof GitCloneArgsSchema>;

/**
 * TOOL: git.clone
 * 指定されたリポジトリをセーフな作業ディレクトリにクローンします。
 */
export const gitCloneTool = createTool<GitCloneArgs, void>({
	name: "git.clone",
	description: "Clone a repository into the safe workspace directory.",
	inputSchema: {
		repository: {
			type: "string",
			description: "GitHub repository URL or 'owner/repo' format.",
		},
		recursive: {
			type: "boolean",
			description: "Set to true to clone submodules recursively.",
		},
	},

	handler: async (args: GitCloneArgs): Promise<ToolResponse<void>> => {
		try {
			const { repository, recursive } = GitCloneArgsSchema.parse(args);
			const safeRoot = getSafePath(".");

			// すでに .git がある場合はクローン済みとみなす
			if (fs.existsSync(`${safeRoot}/.git`)) {
				return toolResult.okVoid(`Repository already exists at ${safeRoot}. Skipping clone.`);
			}

			const token = process.env.GITHUB_TOKEN;
			let target = repository;
			if (!repository.startsWith("http") && !repository.startsWith("git@")) {
				target = token
					? `https://x-access-token:${token}@github.com/${repository}.git`
					: `https://github.com/${repository}.git`;
			}

			console.log(`[GitClone] Cloning ${repository} into ${safeRoot}...`);

			const recursiveFlag = recursive ? "--recursive" : "";

			execSync(`git clone ${recursiveFlag} ${target} .`, {
				cwd: safeRoot,
				stdio: "pipe",
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
			});

			return toolResult.okVoid(`Successfully cloned ${repository} to ${safeRoot}.`);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			return toolResult.fail(`Clone failed: ${msg}`);
		}
	},
});
