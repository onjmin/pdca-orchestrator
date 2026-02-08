import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { orchestrator } from "../core/orchestrator";
import { type Task, taskStack } from "../core/stack-manager";
import { aiTroubleshootEffect } from "../effects/ai/troubleshoot";
import { fileCreateEffect } from "../effects/file/create";
import { fileGrepEffect } from "../effects/file/grep";
import { fileInsertAtEffect } from "../effects/file/insert_at";
import { fileListTreeEffect } from "../effects/file/list_tree";
import { filePatchEffect } from "../effects/file/patch";
import { fileReadLinesEffect } from "../effects/file/read_lines";
import { gitCheckoutEffect } from "../effects/git/checkout";
import { gitCloneEffect } from "../effects/git/clone";
import { githubCreatePullRequestEffect } from "../effects/github/create-pull-request";
import { shellExecEffect } from "../effects/shell/exec";
import { taskCheckEffect } from "../effects/task/check";
import { taskPlanEffect } from "../effects/task/plan";
import { taskSplitEffect } from "../effects/task/split";
import { taskWaitEffect } from "../effects/task/wait";
import { webFetchEffect } from "../effects/web/fetch";
import { webSearchEffect } from "../effects/web/search";
import { webWikipediaEffect } from "../effects/web/wikipedia";

// 利用可能なエフェクトのカタログ
const allEffects = [
	aiTroubleshootEffect,
	fileCreateEffect,
	fileGrepEffect,
	fileInsertAtEffect,
	fileListTreeEffect,
	filePatchEffect,
	fileReadLinesEffect,
	gitCheckoutEffect,
	gitCloneEffect,
	githubCreatePullRequestEffect,
	shellExecEffect,
	taskCheckEffect,
	taskPlanEffect,
	taskSplitEffect,
	taskWaitEffect,
	webFetchEffect,
	webSearchEffect,
	webWikipediaEffect,
];

type AllEffect = (typeof allEffects)[number];
const allRegistry = new Map(allEffects.map((e) => [e.name, e]));

/**
 * 変更系Effects (Mutating Effects)
 * ファイルの書き換え、外部環境の操作、プロセス待機など
 */
const mutatingEffects = new Set<AllEffect>([
	fileCreateEffect,
	fileInsertAtEffect,
	filePatchEffect,
	gitCloneEffect,
	gitCheckoutEffect,
	taskWaitEffect, // 状態が変化する可能性があるためこちらに分類
]);

/**
 * 観察系Effects (Observation Effects)
 * 読み取り、検索、解析など
 */
const observationEffects = new Set<AllEffect>([
	fileGrepEffect,
	fileListTreeEffect,
	fileReadLinesEffect,
	webFetchEffect,
]);
const observationRegistry = new Map([...observationEffects].map((e) => [e.name, e]));

async function main() {
	console.log("--- 小人が起きました ---");

	// 初期タスク読み込み
	const goalPath = resolve(process.cwd(), "GOAL.md");
	let initialTask = {
		title: "Initial Goal",
		description: "Establish the development environment.",
		dod: "Goal achieved.",
	};

	try {
		const rawContent = await fs.readFile(goalPath, "utf-8");
		const parts = rawContent.split("---").map((s) => s.trim());

		if (parts.length !== 3) {
			throw new Error(`⚠️ GOAL file format is invalid. Found ${parts.length} parts.`);
		}

		const [title, description, dod] = parts;
		initialTask = { title, description, dod };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`[CRITICAL] Failed to initialize task: ${msg}`);
	}

	taskStack.push(initialTask);

	// ---- 制御用状態 ----
	let lastTask: Task | null = null;

	let totalTurns = 0;
	let subTaskTurns = 0;
	const MAX_TURNS = 32;

	let observationsAfterMutating = 0;

	let nextEffect: AllEffect | null = null;
	let lastSelectedEffect: AllEffect | null = null;

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;
			subTaskTurns++;
			orchestrator.oneTimeInstruction = "";

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			if (currentTask !== lastTask) {
				lastTask = currentTask;
				subTaskTurns = 1;
				observationsAfterMutating = 0;
			}

			nextEffect = await (async () => {
				// 強制介入: 1ターン目は現状把握
				if (subTaskTurns === 1) {
					return (await orchestrator.selectNextEffect(observationRegistry)) ?? null;
				}

				// 強制介入: 2ターン目はDoDの妥当性を確認させる
				if (subTaskTurns === 2) {
					orchestrator.oneTimeInstruction =
						"Evaluate if the current DoD is simple enough to be completed in a single step. If it feels complex or multi-faceted, use 'task.split' to break it down into smaller, manageable sub-tasks.";
					// ここでは全Registryから選ばせる（AIが「分割不要」と判断すれば通常通り進めるため）
					return (await orchestrator.selectNextEffect(allRegistry)) ?? null;
				}

				// 強制介入: 前ターンが変更系Effectsであれば、観察系Effectsを選出
				if (lastSelectedEffect && mutatingEffects.has(lastSelectedEffect)) {
					observationsAfterMutating++;
					orchestrator.oneTimeInstruction = `Verify that the changes made by '${lastSelectedEffect.name}' were applied correctly and that the results align with the expected state.`;
					return (await orchestrator.selectNextEffect(observationRegistry)) ?? null;
				}

				// 強制介入: 上のルールが規定回数以上発動していれば、DoDチェック
				if (observationsAfterMutating > 3) {
					observationsAfterMutating = 0;
					orchestrator.recordControlSnapshot({
						chosenEffect: taskCheckEffect.name,
						rationale:
							"Sufficient observations have been conducted following modifications. Transitioning to final task verification (DoD).",
					});
					return taskCheckEffect;
				}

				// 通常
				return (await orchestrator.selectNextEffect(allRegistry)) ?? null;
			})();

			if (!nextEffect) continue;

			// --- effect 実行 ---
			await orchestrator.dispatch(nextEffect, currentTask);
			lastSelectedEffect = nextEffect;

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}
		}
	} finally {
		console.log("--- 小人が道具を片付けて寝ます ---");
	}
}

main().catch((err) => {
	console.error(err);
});
