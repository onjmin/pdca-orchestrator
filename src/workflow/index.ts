import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { orchestrator } from "../core/orchestrator";
import { type Task, taskStack } from "../core/stack-manager";
import { aiTheorizeEffect } from "../effects/ai/theorize";
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
	aiTheorizeEffect,
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
	let hasSplit = false;
	let stagnationCount = 0;
	let totalTurns = 0;
	let lastTask: Task | null = null;

	const MAX_TURNS = 20;

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
				hasSplit = false;
				stagnationCount = 0;
				lastTask = currentTask;
			}

			const beforeProgress = taskStack.progress;

			nextEffect = await (async () => {
				// 1. プランニング（最優先）
				if (!hasPlanned) {
					hasPlanned = true;
					return taskPlanEffect;
				}

				// 2. 軽度の停滞：まずは現状を分析させる（Theorize）
				if (stagnationCount === 2) {
					console.log("⚠️ 停滞を検知。現状のボトルネックを推論させます。");
					return aiTheorizeEffect;
				}

				// 3. 重度の停滞または単一タスクでの詰まり：構造分解（Split）
				if (
					!hasSplit &&
					(stagnationCount >= 4 || (stagnationCount >= 2 && taskStack.length === 1))
				) {
					console.log("⚠️ 深刻な停滞。タスクを分割して再定義します。");
					hasSplit = true;
					return taskSplitEffect;
				}

				// 4. 同一行動のループ脱出：強制的に環境を観測させる
				if (sameEffectCount >= 3) {
					console.log("⚠️ ループを検知。強制的にファイルツリーを再確認させます。");
					return fileListTreeEffect;
				}

				// 通常フェーズ：LLM に委譲
				return (await orchestrator.selectNextEffect(registry)) ?? null;
			})();

			if (!nextEffect) {
				// このターンは行動が選べなかった。
				// 状態は更新せず、次の制御ループへ。
				continue;
			}

			// --- Update control snapshot constraints ---
			// オーケストレーターが記録した「選択結果（ControlSnapshot）」に対して、
			// index.ts 側で管理している制御状態を後入れで補足する。
			// ここで渡す情報は LLM の判断材料ではなく、
			// 次回 select フェーズでの「自己観測（Internal Observation）」として利用される。
			orchestrator.updateLastSnapshotConstraints({
				hasPlanned,
				hasSplit,
				stagnationCount,
				sameEffectCount,
			});
			// --- effect 実行 ---
			await orchestrator.dispatch(nextEffect, currentTask);

			// 連続で実行されたeffectをカウント
			if (nextEffect === lastSelectedEffect) {
				sameEffectCount++;
			} else {
				sameEffectCount = 1;
				lastSelectedEffect = nextEffect;
			}

			// --- task.check を「状態変化の直後」に自動発火させる ---
			if (nextEffect && taskImpactingEffects.has(nextEffect)) {
				await orchestrator.dispatch(taskCheckEffect, currentTask);
			}

			// --- 進捗評価 ---
			const afterProgress = taskStack.progress;
			stagnationCount = afterProgress === beforeProgress ? stagnationCount + 1 : 0;

			// --- ターン上限 ---
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
