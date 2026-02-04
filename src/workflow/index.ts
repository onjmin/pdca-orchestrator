import "dotenv/config";
import { orchestrator } from "../core/orchestrator";
import { taskStack } from "../core/stack-manager";
import { analyze } from "../effects/ai/analyze";
import { check } from "../effects/task/check";
import { plan } from "../effects/task/plan";
import { split } from "../effects/task/split";
import type { EffectDefinition } from "../effects/types";

// 利用可能なエフェクトのカタログ
const effects = [check, plan, split, analyze];

const registry: Record<string, EffectDefinition<unknown, unknown>> = Object.fromEntries(
	effects.map((e) => [e.name, e as EffectDefinition<unknown, unknown>]),
);

async function main() {
	// 1. 初手のタスク投入 (ここは基盤側で行う)
	taskStack.push({
		title: "Initial Goal",
		description: process.argv[2] || "Establish the development environment.",
		dod: "Goal achieved.",
	});

	// 2. 初手のエフェクトを選択 (LLMがスタックを見て "task.check" を選ぶ)
	let nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";

	while (!taskStack.isEmpty()) {
		const currentTask = taskStack.currentTask;
		if (!currentTask) break;

		// 3. 選択されたエフェクトを原子的に実行
		// (この内部で taskStack.push/pop やファイル操作が行われる)
		await orchestrator.dispatch(registry[nextEffectName], nextEffectName, currentTask);

		// 4. 実行後の「最新の状態」を見て、次の一手をLLMに再選択させる
		// ここで task.plan に行くか、file.write に行くかをLLMが毎回決める
		nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";
	}
}

main().catch(console.error);
