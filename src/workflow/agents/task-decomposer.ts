import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { initDebugLog, isDebugMode, setLogTurn } from "../../core/debug-log";
import { orchestrator } from "../../core/orchestrator";
import { taskStack } from "../../core/stack-manager";
import { aiTroubleshootEffect } from "../../effects/ai/troubleshoot";
import { fileCreateEffect } from "../../effects/file/create";
import { fileGrepEffect } from "../../effects/file/grep";
import { fileInsertAtEffect } from "../../effects/file/insert_at";
import { fileListTreeEffect } from "../../effects/file/list_tree";
import { filePatchEffect } from "../../effects/file/patch";
import { fileReadLinesEffect } from "../../effects/file/read_lines";
import { gitCheckoutEffect } from "../../effects/git/checkout";
import { gitCloneEffect } from "../../effects/git/clone";
import { githubCreatePullRequestEffect } from "../../effects/github/create-pull-request";
import { shellExecEffect } from "../../effects/shell/exec";
import { taskCheckEffect } from "../../effects/task/check";
import { taskPlanEffect } from "../../effects/task/plan";
import { taskSplitEffect } from "../../effects/task/split";
import { taskWaitEffect } from "../../effects/task/wait";
import { webFetchEffect } from "../../effects/web/fetch";
import { webSearchEffect } from "../../effects/web/search";
import { webWikipediaEffect } from "../../effects/web/wikipedia";

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

export async function run() {
	console.log("--- 小人が起きました ---");

	// 初期タスク読み込み
	const goalPath = resolve(process.cwd(), "GOAL.md");
	let initialTask = {
		title: "Initial Goal",
		description: "Establish the development environment.",
		dod: "Goal achieved.",
		turns: 1,
	};

	try {
		const rawContent = await fs.readFile(goalPath, "utf-8");
		const parts = rawContent.split("---").map((s) => s.trim());

		if (parts.length !== 3) {
			throw new Error(`⚠️ GOAL file format is invalid. Found ${parts.length} parts.`);
		}

		const [title, description, dod] = parts;
		initialTask = { title, description, dod, turns: 1 };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`[CRITICAL] Failed to initialize task: ${msg}`);
	}

	taskStack.push(initialTask);

	let totalTurns = 0;
	const MAX_TURNS = 64;
	initDebugLog();

	let nextEffect: AllEffect | null = null;

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;
			orchestrator.oneTimeInstruction = "";

			if (isDebugMode) {
				console.log(`${totalTurns}ターン目`);
				setLogTurn(totalTurns);
			}

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			currentTask.turns++;

			nextEffect = await (async () => {
				const isInitialParentTask = taskStack.currentTask === initialTask;

				// 強制介入: 現状把握（全タスク共通の1ターン目）
				if (currentTask.turns === 1) {
					return (await orchestrator.selectNextEffect(observationRegistry)) ?? null;
				}

				// 強制介入: 最初の親タスクの2ターン目：分割を強制
				if (isInitialParentTask && currentTask.turns === 2) {
					orchestrator.oneTimeInstruction =
						"The goal is complex. You MUST use 'task.split' to break it down into smaller sub-tasks. Do not start work until the task is split.";
					return (await orchestrator.selectNextEffect(allRegistry)) ?? null;
				}

				// 強制介入: 最初の親タスクの3ターン目：それでも分割してなければ再度警告
				if (isInitialParentTask && currentTask.turns === 3 && !currentTask.strategy) {
					orchestrator.oneTimeInstruction =
						"You haven't split the task yet. Use 'task.split' now to ensure a manageable roadmap.";
					return (await orchestrator.selectNextEffect(allRegistry)) ?? null;
				}

				// 通常
				return (await orchestrator.selectNextEffect(allRegistry)) ?? null;
			})();

			if (!nextEffect) continue;

			// --- effect 実行 ---
			await orchestrator.dispatch(nextEffect, currentTask);

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}
		}
	} finally {
		console.log("--- 小人が道具を片付けて寝ます ---");
	}
}
