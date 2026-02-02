// orchestrator/check.ts
import type { PDCAContext } from "./types";

/**
 * Checkフェーズ
 * - ツール実行結果の評価
 */
export function check(context: PDCAContext): PDCAContext {
	const ok = context.toolResult?.ok ?? false;
	if (!ok) {
		console.warn("ツール失敗。Orchestratorでリトライ対象");
	}
	return { ...context, task: { ...context.task, done: ok } };
}
