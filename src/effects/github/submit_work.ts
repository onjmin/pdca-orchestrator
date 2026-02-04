import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { callGithubMcp } from "./bridge";

export const SubmitWorkArgsSchema = z.object({
	cwd: z.string().optional().describe("Directory of the git repository."),
	branch: z.string().describe("The branch name to push (should match the one from setup_branch)."),
	commit_message: z.string().describe("Brief description of the changes for the git commit."),
	pr_title: z.string().describe("The title of the Pull Request."),
	body_placeholder: z
		.string()
		.describe(
			"MANDATORY: Write ONLY '__DATA__' here. The PR description will be requested separately.",
		),
});

export type SubmitWorkArgs = z.infer<typeof SubmitWorkArgsSchema>;

/**
 * 成功時の詳細データ型。any を排除。
 */
export interface SubmitWorkData {
	git: string;
	github: unknown; // Bridgeからの戻り値は実行時まで不明なため unknown
}

/**
 * EFFECT: github.submit_work
 * 変更をコミット・プッシュし、GitHub PRを作成する。
 */
export const submitWork = createEffect<SubmitWorkArgs, SubmitWorkData>({
	name: "github.submit_work",
	description:
		"Atomically commit all local changes, push to remote, and create/update a GitHub Pull Request.",
	inputSchema: {
		type: "object",
		properties: {
			cwd: { type: "string" },
			branch: { type: "string" },
			commit_message: { type: "string" },
			pr_title: { type: "string" },
			body_placeholder: {
				type: "string",
				description: "Write ONLY '__DATA__' here.",
			},
		},
		required: ["branch", "commit_message", "pr_title", "body_placeholder"],
	},

	handler: async (args: SubmitWorkArgs): Promise<EffectResponse<SubmitWorkData>> => {
		try {
			const { cwd, branch, commit_message, pr_title, body_placeholder } =
				SubmitWorkArgsSchema.parse(args);
			const safeCwd = getSafePath(cwd || ".");

			// 1. Git 操作
			console.log(`[GithubSubmit] Committing and Pushing to '${branch}'...`);
			const gitCommands = [
				`git add .`,
				`git commit -m "${commit_message.replace(/"/g, '\\"')}"`,
				`git push origin ${branch} --force`,
			];

			const gitOutput = execSync(gitCommands.join(" && "), {
				cwd: safeCwd,
				encoding: "utf8",
				stdio: "pipe",
			});

			// 2. GitHub PR 作成
			const [owner, repo] = (process.env.TARGET_REPO || "owner/repo").split("/");
			console.log(`[GithubSubmit] Creating PR: ${pr_title}`);

			const mcpResult = await callGithubMcp("create_pull_request", {
				owner,
				repo,
				title: pr_title,
				body: body_placeholder,
				head: branch,
				base: "main",
			});

			// 成功時: SubmitWorkData を強制
			return effectResult.ok(`Work submitted successfully to branch '${branch}'.`, {
				git: gitOutput,
				github: mcpResult,
			});
		} catch (err: unknown) {
			// any を使わずにエラー情報を抽出
			let errorMessage = "Submission failed";

			if (err && typeof err === "object") {
				const errorWithOutput = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
				const stdout = errorWithOutput.stdout?.toString() || "";
				const stderr = errorWithOutput.stderr?.toString() || "";
				errorMessage = `${errorWithOutput.message}\n${stdout}\n${stderr}`;
			}

			// fail() は EffectResponse<never> を返すため、
			// 戻り値の EffectResponse<SubmitWorkData> と型が自動で一致する
			return effectResult.fail(errorMessage);
		}
	},
});
