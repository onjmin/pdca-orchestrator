import "dotenv/config";
import { notify_progress } from "../../effects/web/messenger";

/**
 * notify_progress エフェクトの単体テスト実行
 */
async function testWebMessenger() {
    console.log("Starting Discord notification test...");

    // テスト用の引数 (マクロとしての抽象化された入力を想定)
    const testArgs = {
        status: "success" as const,
        message: "The test message from bfa-agent. Effect system is working correctly."
    };

    try {
        // 直接ハンドラを呼び出し
        const result = await notify_progress.handler(testArgs);

        if (result.success) {
            console.log("✅ Success!");
            console.log("Summary:", result.summary);
        } else {
            console.error("❌ Failed!");
            console.error("Error:", result.error);
        }
    } catch (err) {
        console.error("💥 Unexpected exception during test:");
        console.error(err);
    }
}

// 実行
testWebMessenger();