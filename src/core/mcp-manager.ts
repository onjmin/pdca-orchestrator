import { type ChildProcess, spawn } from "node:child_process";

// JSON-RPC レスポンスの型定義
interface McpResponse {
	jsonrpc: "2.0";
	id: number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

class McpManager {
	private processes = new Map<string, ChildProcess>();
	private requestCounter = 0;
	// any を排除し、レスポンスを処理する関数の型を定義
	private responseWaiters = new Map<number, (res: McpResponse) => void>();

	async callTool(service: "DUCKDUCKGO" | "GITHUB", toolName: string, args: unknown) {
		const child = this.getOrStartProcess(service);
		const id = ++this.requestCounter;

		const request = {
			jsonrpc: "2.0",
			id,
			method: "call_tool",
			params: {
				name: toolName,
				arguments: args,
			},
		};

		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.responseWaiters.delete(id);
				reject(new Error(`${service} MCP timeout (${toolName})`));
			}, 15000);

			this.responseWaiters.set(id, (res: McpResponse) => {
				clearTimeout(timer);
				if (res.error) {
					reject(new Error(res.error.message || "MCP internal error"));
				} else {
					resolve(res.result);
				}
			});

			if (child.stdin) {
				child.stdin.write(`${JSON.stringify(request)}\n`);
			} else {
				reject(new Error(`${service} MCP stdin is not available`));
			}
		});
	}

	private getOrStartProcess(service: string): ChildProcess {
		const existing = this.processes.get(service);
		if (existing && existing.exitCode === null) return existing;

		const envKey = `${service}_MCP_COMMAND`;
		const commandLine = process.env[envKey];

		if (!commandLine) {
			throw new Error(`Environment variable ${envKey} is not defined.`);
		}

		const [cmd, ...args] = commandLine.split(" ");

		const child = spawn(cmd, args, {
			stdio: ["pipe", "pipe", "pipe"],
			shell: true,
		});

		let buffer = "";

		if (child.stdout) {
			child.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const res = JSON.parse(line) as McpResponse;
						// id が無い通知(Notification)などは無視し、リクエストへの返答のみ処理
						if (typeof res.id === "number") {
							const waiter = this.responseWaiters.get(res.id);
							if (waiter) {
								waiter(res);
								this.responseWaiters.delete(res.id);
							}
						}
					} catch {
						// JSONパース失敗はログ等として無視
					}
				}
			});
		}

		if (child.stderr) {
			child.stderr.on("data", (data: Buffer) => {
				console.error(`[${service} MCP Error]:`, data.toString());
			});
		}

		child.on("exit", (code) => {
			if (code !== 0 && code !== null) {
				console.warn(`[${service} MCP] Exited with code ${code}`);
			}
			this.processes.delete(service);
		});

		this.processes.set(service, child);
		return child;
	}

	shutdown() {
		for (const child of this.processes.values()) {
			child.kill();
		}
		this.processes.clear();
	}
}

export const mcpManager = new McpManager();
