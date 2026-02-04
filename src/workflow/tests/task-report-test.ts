import "dotenv/config";
import { report } from "../../effects/task/report";

/**
 * task.report エフェクトの単体テスト実行用スクリプト
 */
async function testReport() {
	console.log("🚀 Starting Discord Task Report test...");

	// テスト用の引数
	// status: "info" | "success" | "warning" | "error"
	const testArgs = {
		status: "success" as const,
		message: "This is a test report from the bfa-agent. Everything looks solid!",
	};

	try {
		console.log(`📤 Sending report with status: ${testArgs.status}...`);

		// Effect の handler を直接呼び出し
		const result = await report.handler(testArgs);

		if (result.success) {
			console.log("✅ Report Sent Successfully!");
			console.log(`📝 Summary: ${result.summary}`);
		} else {
			console.error("❌ Report Failed!");
			console.error(`🔴 Error: ${result.error}`);

			if (!process.env.DISCORD_WEBHOOK_URL) {
				console.warn("💡 Hint: DISCORD_WEBHOOK_URL is not set in your .env file.");
			}
		}
	} catch (err) {
		console.error("💥 An unexpected error occurred during the test:");
		console.error(err);
	}
}

// 実行
testReport();
