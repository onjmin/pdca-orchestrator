import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createTool, type ToolResponse, toolResult } from "../types";

export const ShellExecArgsSchema = z.object({
	cmd: z.string().describe("The shell command to execute (e.g., 'npm test', 'ls -la')."),
});

export type ShellExecArgs = z.infer<typeof ShellExecArgsSchema>;

export interface ShellExecData {
	stdout: string;
}

/**
 * TOOL: shell.exec
 * プロジェクトルートで任意のシェルコマンドを実行します。
 */
export const shellExecTool = createTool<ShellExecArgs, ShellExecData>({
	name: "shell.exec",
	description: "Execute a shell command in the project root.",
	inputSchema: {
		cmd: {
			type: "string",
			description: "The shell command to execute.",
		},
	},

	handler: async (args: ShellExecArgs): Promise<ToolResponse<ShellExecData>> => {
		try {
			const { cmd } = ShellExecArgsSchema.parse(args);
			// 常にプロジェクトルート（固定値）を使用
			const safeCwd = getSafePath(".");

			console.log(`[ShellExec] Executing: ${cmd} (in ${safeCwd})`);

			const stdout = execSync(cmd, {
				cwd: safeCwd,
				encoding: "utf8",
				timeout: 60000, // 内部で妥当な値を固定（必要なら定数化）
				stdio: "pipe",
				env: {
					...process.env,
					CI: "true",
				},
			});

			return toolResult.ok("Command executed successfully.", { stdout });
		} catch (err: unknown) {
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

			return toolResult.fail(errorMessage);
		}
	},
});
