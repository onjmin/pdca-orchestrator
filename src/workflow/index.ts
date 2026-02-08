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
const availableEffects = [
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

type AvailableEffect = (typeof availableEffects)[number];
const registry = new Map(availableEffects.map((e) => [e.name, e]));

// タスクの進捗や状態を変化させる可能性のあるエフェクト
// nextEffect (AvailableEffect型) をそのまま has() で判定できるよう、型を広げて定義しています
const taskImpactingEffects = new Set<AvailableEffect>([
	// ファイル操作系（確実な変更）
	fileCreateEffect,
	fileInsertAtEffect,
	filePatchEffect,

	// 環境操作・外部連携（変更が伴う）
	gitCloneEffect,
	gitCheckoutEffect,
	shellExecEffect,
	githubCreatePullRequestEffect, // PR作成も一つの進捗

	// 時間経過による変化（外部プロセスの完了待ちなど）
	taskWaitEffect,
]);

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
	let hasPlanned = false;
	let stagnationCount = 0;
	let totalTurns = 0;
	let lastTask: Task | null = null;
	let modificationCount = 0; // 変更系エフェクトの実行回数を追跡

	const MAX_TURNS = 20;
	const MODIFICATION_THRESHOLD = 3; // 何回変更したらチェックするか

	let nextEffect: AvailableEffect | null = null;
	let lastSelectedEffect: AvailableEffect | null = null;
	let sameEffectCount = 0;

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			if (currentTask !== lastTask) {
				hasPlanned = false;
				stagnationCount = 0;
				modificationCount = 0; // タスクが変わったらリセット
				lastTask = currentTask;
			}

			const beforeProgress = taskStack.progress;

			// --- effect 選択（強制介入 + 記録） ---
			nextEffect = await (async () => {
				// --- 強制介入: 毎タスク初回のプランフェーズ ---
				if (!hasPlanned) {
					hasPlanned = true;
					orchestrator.recordControlSnapshot({
						chosenEffect: taskPlanEffect.name,
						rationale: "Initial planning is required for a new task.",
					});
					return taskPlanEffect;
				}

				// --- 強制介入: 変更が一定回数に達したら自動でタスク完了チェックを行う ---
				if (modificationCount >= MODIFICATION_THRESHOLD) {
					modificationCount = 0; // カウントリセット
					orchestrator.recordControlSnapshot({
						chosenEffect: taskCheckEffect.name,
						rationale: `強制介入: ${MODIFICATION_THRESHOLD} consecutive modifications performed. Verifying progress.`,
					});
					return taskCheckEffect;
				}

				// --- 強制介入: 停滞時のトラブルシュート ---
				if (stagnationCount >= 2) {
					const isModification = [
						fileCreateEffect.name,
						taskSplitEffect.name,
						taskPlanEffect.name,
					].includes(lastSelectedEffect?.name ?? "");

					if (isModification) {
						const rationale =
							"Modification without progress. Re-evaluate the situation through theorization.";
						orchestrator.recordControlSnapshot({
							chosenEffect: aiTroubleshootEffect.name,
							rationale,
						});
						return aiTroubleshootEffect;
					}
				}

				if (stagnationCount >= 4) {
					orchestrator.recordControlSnapshot({
						chosenEffect: aiTroubleshootEffect.name,
						rationale: "Critical stagnation. Performing root cause analysis.",
					});
					return aiTroubleshootEffect;
				}

				// 通常フェーズ：LLM に委譲
				return (await orchestrator.selectNextEffect(registry)) ?? null;
			})();

			if (!nextEffect) continue;

			// --- Update control snapshot constraints ---
			orchestrator.updateLastSnapshotConstraints({
				stagnationCount,
				sameEffectCount,
			});

			// --- effect 実行 ---
			await orchestrator.dispatch(nextEffect, currentTask);

			// 変更系エフェクトが実行されたらカウントアップ
			if (taskImpactingEffects.has(nextEffect)) {
				modificationCount++;
			}

			// 連続実行カウントの更新
			if (nextEffect === lastSelectedEffect) {
				sameEffectCount++;
			} else {
				sameEffectCount = 1;
				lastSelectedEffect = nextEffect;
			}

			// --- 進捗評価 ---
			const afterProgress = taskStack.progress;
			stagnationCount = afterProgress === beforeProgress ? stagnationCount + 1 : 0;

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
