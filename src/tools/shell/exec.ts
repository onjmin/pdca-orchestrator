import { execSync } from "node:child_process";
import { z } from "zod";
import { getSafePath } from "../file/utils";
import { createTool, type ToolResponse, toolResult } from "../types";

export const ShellExecArgsSchema = z.object({
	cwd: z.string().describe("Directory to execute the command. Defaults to project root."),
	command: z.string().describe("The shell command to execute (e.g., 'npm test', 'ls -la')."),
	timeout: z.number().describe("Timeout in milliseconds (default: 60000)."),
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
 * 任意のシェルコマンドを実行します。
 */
export const shellExecEffect = createTool<ShellExecArgs, ShellExecData>({
	name: "shell.exec",
	description:
		"Execute an arbitrary shell command in the local environment. Use this to run tests, build the project, or check environment status.",
	inputSchema: {
		cwd: {
			type: "string",
			description: "Directory to execute the command. Use '.' for project root.",
		},
		command: {
			type: "string",
			description: "The shell command to execute.",
		},
		timeout: {
			type: "number",
			description: "Timeout in milliseconds.",
		},
	},

	handler: async (args: ShellExecArgs): Promise<ToolResponse<ShellExecData>> => {
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
