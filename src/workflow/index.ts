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

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			if (currentTask !== lastTask) {
				hasPlanned = false;
				stagnationCount = 0;
				lastTask = currentTask;
			}

			const beforeProgress = taskStack.progress;

			// --- effect 選択（完全に機械主導） ---
			if (!hasPlanned) {
				/**
				 * task.plan はタスク開始時に必ず1回だけ実行する。
				 * 再計画は LLM の気分ではなく、タスク差し替え時にのみ行う。
				 */
				nextEffect = taskPlanEffect;
				hasPlanned = true;
			} else if (stagnationCount === 1 && !hasSplit && taskStack.length === 1) {
				/**
				 * 初期停滞時のみ task.split を許可する。
				 * これにより粒度過多タスクの分解はできるが、
				 * 無限 split ループは防止される。
				 */
				nextEffect = taskSplitEffect;
				hasSplit = true;
			} else {
				/**
				 * 通常時は次の action 選択を LLM に委ねる。
				 * ただし task.check はここでは選ばせない。
				 */
				nextEffect = (await orchestrator.selectNextEffect(registry)) ?? null;

				if (nextEffect === taskCheckEffect) {
					nextEffect = null;
				}
			}

			// fallback（何も選ばれなかった場合）
			if (!nextEffect) {
				nextEffect = taskWaitEffect;
			}

			// --- effect 実行 ---
			await orchestrator.dispatch(nextEffect, currentTask);

			// --- task.check は「状態変化の直後」にのみ自動発火 ---
			if (nextEffect && taskImpactingEffects.has(nextEffect)) {
				/**
				 * task.check は検証であり思考ではない。
				 * そのため「世界が変わった直後」にのみ実行する。
				 */
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
