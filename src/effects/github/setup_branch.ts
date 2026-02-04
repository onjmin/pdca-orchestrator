import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const SetupBranchArgsSchema = z.object({
	cwd: z.string().optional().describe("Directory of the git repository."),
	branch: z.string().describe("The name of the new feature branch to create."),
	base: z
		.string()
		.default("main")
		.describe("The base branch to start from (e.g., 'main' or 'develop')."),
});

export type SetupBranchArgs = z.infer<typeof SetupBranchArgsSchema>;

/**
 * gitコマンドの実行結果を保持する型
 */
export interface SetupBranchData {
	stdout: string;
}

/**
 * EFFECT: github.setup_branch
 * リモートから最新を取得し、作業用ブランチをクリーンにセットアップする。
 */
export const setupBranch = createEffect<SetupBranchArgs, SetupBranchData>({
	name: "github.setup_branch",
	description:
		"Atomically update the base branch from remote and create a clean feature branch. Use this at the start of every new task.",
	inputSchema: {
		type: "object",
		properties: {
			cwd: { type: "string" },
			branch: { type: "string", description: "Name of the branch to create/reset." },
			base: { type: "string", description: "Base branch to pull from (default: main)." },
		},
		required: ["branch"],
	},

	handler: async (args: SetupBranchArgs): Promise<EffectResponse<SetupBranchData>> => {
		try {
			const { cwd, branch, base } = SetupBranchArgsSchema.parse(args);
			const safeCwd = getSafePath(cwd || ".");

			console.log(`[GithubSetup] Synchronizing with origin/${base} and creating branch: ${branch}`);

			const commands = [
				`git fetch origin ${base}`,
				`git checkout ${base}`,
				`git reset --hard origin/${base}`,
				`git checkout -B ${branch}`,
			];

			const stdout = execSync(commands.join(" && "), {
				cwd: safeCwd,
				encoding: "utf8",
				stdio: "pipe",
			});

			// 成功時: SetupBranchData (stdout) の返却を強制
			return effectResult.ok(
				`Branch '${branch}' is now clean and synchronized with origin/${base}.`,
				{ stdout },
			);
		} catch (err: unknown) {
			// unknown を使用し、安全にエラー情報を抽出
			let errorMessage = "Git setup failed";

			if (err && typeof err === "object") {
				const errorWithOutput = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
				const stdout = errorWithOutput.stdout?.toString() || "";
				const stderr = errorWithOutput.stderr?.toString() || "";
				errorMessage = `${errorWithOutput.message}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`;
			}

			// 失敗時: EffectResponse<never> が返り、型安全に Promise<EffectResponse<SetupBranchData>> と適合
			return effectResult.fail(errorMessage);
		}
	},
});
