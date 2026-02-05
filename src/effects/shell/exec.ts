import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";

export const ShellExecArgsSchema = z.object({
	cwd: z
		.string()
		.optional()
		.describe("Directory to execute the command. Defaults to project root."),
	command: z.string().describe("The shell command to execute (e.g., 'npm test', 'ls -la')."),
	timeout: z.number().default(60000).describe("Timeout in milliseconds (default: 60s)."),
});

export type ShellExecArgs = z.infer<typeof ShellExecArgsSchema>;

/**
 * 実行結果のデータ構造
 */
export interface ShellExecData {
	stdout: string;
}

/**
 * EFFECT: shell.exec
 * コマンド実行結果の stdout を ShellExecData として返すことを強制。
 */
export const exec = createEffect<ShellExecArgs, ShellExecData>({
	name: "shell.exec",
	description:
		"Execute an arbitrary shell command in the local environment. Use this to exec tests, build the project, or check environment status.",
	inputSchema: {
		type: "object",
		properties: {
			cwd: { type: "string" },
			command: { type: "string" },
			timeout: { type: "number" },
		},
	},

	handler: async (args: ShellExecArgs): Promise<EffectResponse<ShellExecData>> => {
		try {
			const { cwd, command, timeout } = ShellExecArgsSchema.parse(args);
			const safeCwd = getSafePath(cwd || ".");

			console.log(`[ShellExec] Executing: ${command} (in ${safeCwd})`);

			const stdout = execSync(command, {
				cwd: safeCwd,
				encoding: "utf8",
				timeout: timeout,
				stdio: "pipe",
				env: {
					...process.env,
					CI: "true",
				},
			});

			// 成功時: data として stdout を渡すことが型で強制される
			return effectResult.ok("Command executed successfully.", { stdout });
		} catch (err: unknown) {
			// any を排除し、Node.js の ExecSyncError 構造を安全に処理
			let errorMessage = "Unknown shell error";

			if (err && typeof err === "object") {
				const errorWithOutput = err as {
					stdout?: Buffer;
					stderr?: Buffer;
					status?: number;
					message?: string;
				};

				const stdout = errorWithOutput.stdout?.toString() || "";
				const stderr = errorWithOutput.stderr?.toString() || "";
				const status = errorWithOutput.status ?? "unknown";

				errorMessage = `Exit Code: ${status}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nMsg: ${errorWithOutput.message}`;
			}

			// fail() により EffectResponse<never> が返るため、
			// 戻り値の EffectResponse<ShellExecData> と型が一致する
			return effectResult.fail(errorMessage);
		}
	},
});
