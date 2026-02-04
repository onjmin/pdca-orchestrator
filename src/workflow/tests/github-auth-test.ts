import "dotenv/config";
import { mcpManager } from "../../core/mcp-manager";

async function testGithubAuth() {
	console.log("--- GitHub MCP Auth Test Start ---");

	const repo = process.env.GITHUB_TARGET_REPO;
	const hasToken = !!process.env.GITHUB_TOKEN;

	console.log(`Target Repo: ${repo}`);
	console.log(`Token Configured: ${hasToken}`);

	if (!hasToken || !repo) {
		console.error("❌ GITHUB_TOKEN or GITHUB_TARGET_REPO is missing in .env");
		return;
	}

	try {
		console.log("\n[Test] Fetching repository info via GitHub MCP...");
		console.log("(初回は npx の起動待ちが発生します)");

		const [owner, repoName] = repo.split("/");

		// ブランチ作成の代わりに、リポジトリ情報を取得するだけのツールを実行
		// これにより、Tokenの有効性と権限が確認できます
		const result = await mcpManager.callTool("GITHUB", "get_repository", {
			owner,
			repo: repoName,
		});

		console.log("✅ Connection Success!");
		console.log("Response Data:", JSON.stringify(result, null, 2));
	} catch (err) {
		console.error("❌ GitHub Auth Failed!");
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${msg}`);

		console.log("\nPossible causes:");
		console.log("1. GITHUB_TOKEN is invalid or expired.");
		console.log("2. GITHUB_TOKEN does not have 'repo' scope.");
		console.log("3. GITHUB_TARGET_REPO format is wrong (should be 'owner/repo').");
	} finally {
		console.log("\n[Cleanup] Shutting down MCP server...");
		mcpManager.shutdown();
	}

	console.log("--- Test Finished ---");
}

testGithubAuth().catch(console.error);
