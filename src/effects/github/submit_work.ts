import { z } from "zod";
import { mcpManager } from "../../core/mcp-manager";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const SubmitWorkArgsSchema = z.object({
	branch: z.string().describe("The branch name to push."),
	commit_message: z.string().describe("Brief description of the changes."),
	pr_title: z.string().describe("The title of the Pull Request."),
	body_placeholder: z.string().describe("PR description. Write ONLY '__DATA__' for now."),
});

export type SubmitWorkArgs = z.infer<typeof SubmitWorkArgsSchema>;

export interface SubmitWorkData {
	message: string;
	github: unknown;
}

/**
 * EFFECT: github.submit_work
 * 変更をプッシュし、GitHub PRを作成する。
 */
export const submitWork = createEffect<SubmitWorkArgs, SubmitWorkData>({
	name: "github.submit_work",
	description: "Push changes and create a GitHub Pull Request via MCP.",
	inputSchema: {
		type: "object",
		properties: {
			branch: { type: "string" },
			commit_message: { type: "string" },
			pr_title: { type: "string" },
			body_placeholder: { type: "string" },
		},
		required: ["branch", "commit_message", "pr_title", "body_placeholder"],
	},

	handler: async (args: SubmitWorkArgs): Promise<EffectResponse<SubmitWorkData>> => {
		try {
			const { branch, pr_title, body_placeholder } = SubmitWorkArgsSchema.parse(args);
			const ownerRepo = process.env.GITHUB_TARGET_REPO;

			if (!ownerRepo) {
				return effectResult.fail("GITHUB_TARGET_REPO is not defined in .env");
			}

			const [owner, repo] = ownerRepo.split("/");

			console.log(`[GithubSubmit] Creating PR on ${ownerRepo}: ${pr_title}`);

			/**
			 * 1. Push changes
			 * 注: server-github の仕様により push ツールが異なる場合があります。
			 * 多くの場合はファイルの作成・更新を直接 API で行いますが、
			 * ここでは PR 作成に焦点を当てます。
			 */

			// 2. PR作成
			const mcpResult = await mcpManager.callTool("GITHUB", "create_pull_request", {
				owner,
				repo,
				title: pr_title,
				body: body_placeholder,
				head: branch,
				base: "main",
			});

			return effectResult.ok(`Work submitted successfully. PR created for '${branch}'.`, {
				message: "PR creation successful.",
				github: mcpResult,
			});
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`GitHub submission failed: ${errorMessage}`);
		}
	},
});
