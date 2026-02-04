import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const GitCheckoutArgsSchema = z.object({
	branch: z.string().describe("The name of the branch to checkout."),
	createIfMissing: z
		.boolean()
		.default(false)
		.describe("Whether to create a new branch if it does not exist (git checkout -b)."),
	startPoint: z
		.string()
		.optional()
		.describe("The starting point for the new branch (e.g., 'main' or 'origin/main')."),
	force: z
		.boolean()
		.default(true)
		.describe("If true, discards local changes to ensure a clean checkout."),
});

export type GitCheckoutArgs = z.infer<typeof GitCheckoutArgsSchema>;

/**
 * EFFECT: git.checkout
 * 汚れをリセットしてから指定ブランチへ切り替えます。
 */
export const checkout = createEffect<GitCheckoutArgs, void>({
	name: "git.checkout",
	description: "Checkout a branch. By default, it resets local changes to ensure success.",
	inputSchema: {
		type: "object",
		properties: {
			branch: { type: "string" },
			createIfMissing: { type: "boolean" },
			startPoint: { type: "string" },
		},
		required: ["branch"],
	},

	handler: async (args: GitCheckoutArgs): Promise<EffectResponse<void>> => {
		try {
			const { branch, createIfMissing, startPoint, force } = GitCheckoutArgsSchema.parse(args);
			const safeCwd = getSafePath(".");
			const git = (cmd: string) => execSync(cmd, { cwd: safeCwd, encoding: "utf8", stdio: "pipe" });

			// 1. 強制クリーンアップ（forceがtrueの場合）
			if (force) {
				console.log(`[GitCheckout] Cleaning up local changes in ${safeCwd}...`);
				try {
					git("git reset --hard HEAD");
					git("git clean -fd");
				} catch (e) {
					console.warn("Cleanup warning (initial repo might be empty):", e);
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

			return effectResult.okVoid(`Successfully checked out to branch: ${branch} (Force: ${force})`);
		} catch (err: unknown) {
			let errorMessage = "Checkout failed";
			if (err && typeof err === "object" && "stderr" in err) {
				errorMessage = String((err as { stderr: unknown }).stderr);
			} else if (err instanceof Error) {
				errorMessage = err.message;
			}
			return effectResult.fail(errorMessage);
		}
	},
});
