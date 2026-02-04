import { z } from "zod";
import { mcpManager } from "../../core/mcp-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const SetupBranchArgsSchema = z.object({
	branch: z.string().describe("The name of the new feature branch to create."),
	base: z
		.string()
		.default("main")
		.describe("The base branch to start from (e.g., 'main' or 'develop')."),
});

export type SetupBranchArgs = z.infer<typeof SetupBranchArgsSchema>;

export interface SetupBranchData {
	message: string;
}

/**
 * EFFECT: github.setup_branch
 * MCP 経由でリポジトリのブランチをクリーンにセットアップします。
 */
export const setupBranch = createEffect<SetupBranchArgs, SetupBranchData>({
	name: "github.setup_branch",
	description: "Create a clean feature branch from the base branch using GitHub MCP.",
	inputSchema: {
		type: "object",
		properties: {
			branch: { type: "string" },
			base: { type: "string" },
		},
		required: ["branch"],
	},

	handler: async (args: SetupBranchArgs): Promise<EffectResponse<SetupBranchData>> => {
		try {
			const { branch, base } = SetupBranchArgsSchema.parse(args);
			const ownerRepo = process.env.GITHUB_TARGET_REPO; // "owner/repo"

			if (!ownerRepo) {
				return effectResult.fail("GITHUB_TARGET_REPO is not configured in .env");
			}

			const [owner, repo] = ownerRepo.split("/");

			console.log(`[GithubSetup] Creating branch '${branch}' from '${base}' on ${ownerRepo}`);

			// GitHub MCP の 'create_branch' ツールを呼び出す
			// 注: ツール名や引数は使用する MCP サーバーの仕様に合わせて調整してください
			await mcpManager.callTool("GITHUB", "create_branch", {
				owner,
				repo,
				branch,
				from_branch: base,
			});

			return effectResult.ok(`Branch '${branch}' has been created from '${base}' via GitHub API.`, {
				message: `Success: ${branch} is ready.`,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`GitHub setup failed: ${errorMessage}`);
		}
	},
});
