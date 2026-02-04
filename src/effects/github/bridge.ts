import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// MCPクライアントのインスタンスを保持
let githubMcpClient: Client | null = null;

/**
 * GitHub MCP サーバーを起動し、接続を確立する
 */
async function getClient(): Promise<Client> {
	if (githubMcpClient) return githubMcpClient;

	// 1. サーバーの起動設定（npx経由でGitHub MCPサーバーを起動）
	// 環境変数 GITHUB_TOKEN が設定されている必要があります
	const transport = new StdioClientTransport({
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-github"],
		env: {
			...process.env,
			GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
		},
	});

	const client = new Client(
		{ name: "my-autonomous-agent", version: "1.0.0" },
		{ capabilities: {} },
	);

	// 2. 接続開始
	await client.connect(transport);

	githubMcpClient = client;
	console.log("[MCP] Connected to GitHub Server");
	return githubMcpClient;
}

/**
 * 指定した GitHub ツールを呼び出す共通関数
 */
export async function callGithubMcp(toolName: string, args: any) {
	const client = await getClient();

	try {
		// MCP プロトコルに従ってツールを実行
		const response = await client.callTool({
			name: toolName,
			arguments: args,
		});

		// エラーチェック（MCPは正常系レスポンスの中に isError を持つ場合がある）
		if (response.isError) {
			throw new Error(JSON.stringify(response.content));
		}

		return response.content;
	} catch (error: any) {
		console.error(`[MCP Error] Tool ${toolName} failed:`, error);
		throw error;
	}
}
