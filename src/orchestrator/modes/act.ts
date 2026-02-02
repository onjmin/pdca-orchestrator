import { callLLM } from "../../llm/client";
import type { PDCAContext } from "../types";

/**
 * Actモード専用のシステムプロンプト
 */
const ACT_SYSTEM_PROMPT = `
あなたは自律エージェントの「記憶整理・内省フェーズ」担当です。
これまでの複雑なやり取り（history）を、次のサイクルで役立つ「要約」に圧縮してください。

1. 成功した手順、失敗した原因、判明した重要な事実を簡潔に抽出してください。
2. 内部的な試行錯誤（MCPの細かいログなど）は捨て、結論と現在の状態のみを残してください。
3. 出力は、次のPlanモードのLLMが「今どこまで終わっていて、次に何から始めるべきか」を即座に理解できる内容にしてください。
`;

export async function actMode(context: PDCAContext): Promise<PDCAContext> {
	console.log(`  [Act] 記憶の整理を開始します... (現在のログ数: ${context.history.length})`);

	// 1. LLMにこれまでの全ログを渡して要約を依頼
	// Actモードでは MCPツールを使わない（純粋な思考のみ）
	const output = await callLLM(context, ACT_SYSTEM_PROMPT);

	// 2. 圧縮された記憶を summary に統合（または上書き）
	// 前回の要約も含めて再構築させることで、記憶の質を維持します。
	context.summary = output.thought || "要約の生成に失敗しました。";

	// 3. 【重要】生ログを破棄してコンテキストを解放する
	// これにより、次のサイクルでは vRAM を消費する履歴がリセットされます。
	context.history = [];

	// 4. 次のステートを決定
	if (context.isGoalReached) {
		console.log("  [Act] 最終目標に到達しているため、ミッションを終了します。");
		context.state = "FINISHED";
	} else {
		console.log("  [Act] 記憶を整理しました。次のサイクル（Plan）へ移行します。");
		context.state = "PLAN";
	}

	return context;
}
