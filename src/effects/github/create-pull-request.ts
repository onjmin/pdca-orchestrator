import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const CreatePullRequestArgsSchema = z.object({
	title: z.string().describe("The title of the pull request. Summarize the changes concisely."),
	body: z
		.string()
		.describe("The description of the changes. Include what was implemented and why."),
	branch: z.string().describe("The local branch name containing your changes to be pushed."),
	base: z
		.string()
		.default("main")
		.describe("The target branch on GitHub you want to merge into (e.g., 'main')."),
});

export type CreatePullRequestArgs = z.infer<typeof CreatePullRequestArgsSchema>;

export interface CreatePullRequestData {
	url: string;
}

/**
 * EFFECT: github.create_pull_request
 * ローカルの変更をコミットし、リモートへプッシュした上で、GitHub上でPRを作成します。
 * 小人が仕事を完成させた際の「最終報告」用ツールです。
 */
export const createPullRequest = createEffect<CreatePullRequestArgs, CreatePullRequestData>({
	name: "github.create_pull_request",
	description:
		"Submit your work. Automatically handles add, commit, push, and PR creation. Call this once to finish your task.",
	inputSchema: {
		title: {
			type: "string",
			description: "PR title (also used as commit message).",
		},
		body: {
			type: "string",
			description: "PR description.",
		},
		branch: {
			type: "string",
			description: "Your working branch name.",
		},
		base: {
			type: "string",
			description: "Target branch (default: main).",
		},
	},

	handler: async (args: CreatePullRequestArgs): Promise<EffectResponse<CreatePullRequestData>> => {
		try {
			const { title, body, branch, base } = CreatePullRequestArgsSchema.parse(args);
			const safeCwd = getSafePath(".");
			const token = process.env.GITHUB_TOKEN;
			const ownerRepo = process.env.GITHUB_TARGET_REPO;

			if (!token || !ownerRepo) {
				return effectResult.fail(
					"Security Error: GITHUB_TOKEN or GITHUB_TARGET_REPO is not configured in .env",
				);
			}

			const [owner, repo] = ownerRepo.split("/");
			const octokit = new Octokit({ auth: token });
			const git = (cmd: string) => execSync(cmd, { cwd: safeCwd, encoding: "utf8", stdio: "pipe" });

			console.log(`[GithubPR] Preparing to submit changes on branch '${branch}'...`);

			// 1. ローカルでのコミット作業
			git("git add .");
			try {
				const escapedMessage = title.replace(/"/g, '\\"');
				git(`git commit -m "${escapedMessage}"`);
			} catch (err: unknown) {
				// 変更がない場合はPRを作成できない
				if (err && typeof err === "object" && ("stdout" in err || "stderr" in err)) {
					const out = String((err as { stdout?: string }).stdout || "");
					if (out.includes("nothing to commit")) {
						return effectResult.fail(
							"No changes detected in the workspace. Please make sure you have modified or created files before creating a PR.",
						);
					}
				}
				throw err;
			}

			// 2. リモートへプッシュ (認証情報を埋め込んだURLで確実に実行)
			console.log(`[GithubPR] Pushing changes to origin/${branch}...`);
			const remoteUrl = `https://x-access-token:${token}@github.com/${ownerRepo}.git`;
			git(`git push -f ${remoteUrl} ${branch}`); // 小人の作業なので、基本的には強制上書きでOKとする

			// 3. GitHub API で Pull Request 作成
			console.log(`[GithubPR] Opening Pull Request on GitHub...`);
			const { data: pr } = await octokit.pulls.create({
				owner,
				repo,
				title,
				body,
				head: branch,
				base,
			});

			return effectResult.ok(`Successfully created Pull Request: ${pr.html_url}`, {
				url: pr.html_url,
			});
		} catch (err: unknown) {
			let errorMessage = "Pull Request creation failed";

			if (err && typeof err === "object" && "response" in err) {
				// Octokit/GitHub API 特有のエラーメッセージを抽出
				const octoErr = err as {
					response: { data: { message?: string; errors?: Array<{ message: string }> } };
				};
				errorMessage =
					octoErr.response.data.errors?.[0]?.message ||
					octoErr.response.data.message ||
					errorMessage;
			} else if (err instanceof Error) {
				errorMessage = err.message;
			}

			return effectResult.fail(`GitHub API Error: ${errorMessage}`);
		}
	},
});
