import "dotenv/config";
import { Octokit } from "@octokit/rest";

async function testOctokitAuth() {
	console.log("--- GitHub Octokit Auth Test ---");

	const token = process.env.GITHUB_TOKEN;
	const targetRepo = process.env.GITHUB_TARGET_REPO; // "owner/repo"

	if (!token || !targetRepo) {
		console.error("❌ GITHUB_TOKEN or GITHUB_TARGET_REPO is missing.");
		return;
	}

	const octokit = new Octokit({ auth: token });
	const [owner, repo] = targetRepo.split("/");

	try {
		console.log(`[Test] Fetching repository: ${owner}/${repo}...`);

		const { data } = await octokit.repos.get({
			owner,
			repo,
		});

		console.log("✅ Connection Success!");
		console.log(`Repository ID: ${data.id}`);
		console.log(`Default Branch: ${data.default_branch}`);
		console.log(`Permissions: ${JSON.stringify(data.permissions)}`);
	} catch (err: unknown) {
		console.error("❌ GitHub Octokit Error!");

		if (err && typeof err === "object" && "status" in err) {
			// Octokitのエラーオブジェクトから情報を抽出
			const octoErr = err as { status: number; message: string; response?: { data: unknown } };
			console.error(`Status: ${octoErr.status}`);
			console.error(`Message: ${octoErr.message}`);

			if (octoErr.status === 401) {
				console.error("💡 Hint: GITHUB_TOKEN が無効か、有効期限が切れている可能性があります。");
			} else if (octoErr.status === 404) {
				console.error(
					"💡 Hint: リポジトリが見つからないか、TOKEN にリポジトリへのアクセス権限（Repo scope）がありません。",
				);
			}
		} else {
			console.error(`Unknown Error: ${String(err)}`);
		}
	}
}

testOctokitAuth();
