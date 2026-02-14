import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createTool, type ToolResponse, toolResult } from "../types";

export const GitCheckoutArgsSchema = z.object({
	branch: z.string().describe("The name of the branch to checkout."),
	createIfMissing: z.boolean().describe("Create a new branch if it does not exist."),
	startPoint: z.string().optional().describe("The starting point for the new branch."),
	force: z.boolean().describe("If true, discards local changes to ensure a clean checkout."),
});

export type GitCheckoutArgs = z.infer<typeof GitCheckoutArgsSchema>;

/**
 * EFFECT: git.checkout
 * 指定ブランチへ切り替えます。
 */
export const gitCheckoutTool = createTool<GitCheckoutArgs, void>({
	name: "git.checkout",
	description: "Checkout a branch. By default, it resets local changes to ensure success.",
	inputSchema: {
		branch: {
			type: "string",
			description: "Target branch name.",
		},
		createIfMissing: {
			type: "boolean",
			description: "Whether to use 'git checkout -b'.",
		},
		startPoint: {
			type: "string",
			description: "Optional start point for the new branch (e.g., 'main').",
		},
		force: {
			type: "boolean",
			description: "Discard local changes to prevent checkout failure.",
		},
	},

	handler: async (args: GitCheckoutArgs): Promise<ToolResponse<void>> => {
		try {
			const { branch, createIfMissing, startPoint, force } = GitCheckoutArgsSchema.parse(args);
			const safeCwd = getSafePath(".");
			const git = (cmd: string) => execSync(cmd, { cwd: safeCwd, encoding: "utf8", stdio: "pipe" });

			// 1. 強制クリーンアップ
			if (force) {
				console.log(`[GitCheckout] Cleaning up local changes in ${safeCwd}...`);
				try {
					git("git reset --hard HEAD");
					git("git clean -fd");
				} catch (e) {
					console.warn("Cleanup warning:", e);
				}
			}

			// 2. チェックアウト実行
			let command = `git checkout ${branch}`;
			if (createIfMissing) {
				const base = startPoint ? ` ${startPoint}` : "";
				command = `git checkout -b ${branch}${base}`;
			}

			console.log(`[GitCheckout] Executing: ${command}`);
			git(command);

			return toolResult.okVoid(`Successfully checked out to branch: ${branch}`);
		} catch (err: unknown) {
			let errorMessage = "Checkout failed";
			if (err && typeof err === "object" && "stderr" in err) {
				errorMessage = String((err as { stderr: unknown }).stderr);
			} else if (err instanceof Error) {
				errorMessage = err.message;
			}
			return toolResult.fail(errorMessage);
		}
	},
});
