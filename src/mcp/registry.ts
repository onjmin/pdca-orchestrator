import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolResult } from "./schema";

// 内部ツールの型定義
type InternalTool = {
	name: string;
	description: string;
	inputSchema: any;
	handler: (args: any) => Promise<ToolResult>;
};

class McpRegistry {
	private toolMap: Map<string, Client> = new Map();
	private internalTools: Map<string, InternalTool> = new Map();
	// 【追加】外部MCPクライアントを管理する配列
	private clients: Client[] = [];

	// プロジェクト内の関数をツールとして登録
	registerInternalTool(tool: InternalTool) {
		this.internalTools.set(tool.name, tool);
		console.log(`  - Internal Tool registered: ${tool.name}`);
	}

	/**
	 * サーバーを登録し、利用可能なツールを取得・マッピングする
	 */
	async registerServer(name: string, command: string, args: string[]) {
		console.log(`[MCP Registry] Connecting to server: ${name}...`);

		const transport = new StdioClientTransport({ command, args });
		const client = new Client(
			{ name: "elves-shoemaker-client", version: "1.0.0" },
			{ capabilities: {} },
		);

		await client.connect(transport);

		// サーバーからツール一覧を取得
		const { tools } = await client.listTools();

		for (const tool of tools) {
			this.toolMap.set(tool.name, client);
			console.log(`  - Tool registered: ${tool.name}`);
		}

		this.clients.push(client);
	}

	/**
	 * 全てのツール定義（外部 + 内部）をLLM用に取得
	 */
	async getAllToolsForLLM() {
		// 型を明示的に指定して初期化
		const externalTools: any[] = [];

		for (const client of this.clients) {
			const { tools } = await client.listTools();
			externalTools.push(...tools);
		}

		const internal = Array.from(this.internalTools.values()).map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		}));

		return [...externalTools, ...internal];
	}

	getInternalTool(name: string) {
		return this.internalTools.get(name);
	}

	getClientByToolName(name: string) {
		return this.toolMap.get(name);
	}
}

export const mcpRegistry = new McpRegistry();
