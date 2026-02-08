import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { orchestrator } from "../core/orchestrator";
import { type Task, taskStack } from "../core/stack-manager";
import { aiTheorize } from "../effects/ai/theorize";
import { fileCreate } from "../effects/file/create";
import { fileGrep } from "../effects/file/grep";
import { fileInsertAt } from "../effects/file/insert_at";
import { fileListTree } from "../effects/file/list_tree";
import { filePatch } from "../effects/file/patch";
import { fileReadLines } from "../effects/file/read_lines";
import { gitCheckout } from "../effects/git/checkout";
import { gitClone } from "../effects/git/clone";
import { githubCreatePullRequest } from "../effects/github/create-pull-request";
import { shellExec } from "../effects/shell/exec";
import { taskCheck } from "../effects/task/check";
import { taskPlan } from "../effects/task/plan";
import { taskSplit } from "../effects/task/split";
import { taskWait } from "../effects/task/wait";
import type { EffectDefinition } from "../effects/types";
import { webFetch } from "../effects/web/fetch";
import { webSearch } from "../effects/web/search";
import { webWikipedia } from "../effects/web/wikipedia";

// 利用可能なエフェクトのカタログ
const effects = [
	aiTheorize,
	fileCreate,
	fileGrep,
	fileInsertAt,
	fileListTree,
	filePatch,
	fileReadLines,
	gitCheckout,
	gitClone,
	githubCreatePullRequest,
	shellExec,
	taskCheck,
	taskPlan,
	taskSplit,
	taskWait,
	webFetch,
	webSearch,
	webWikipedia,
];

const registry: Record<string, EffectDefinition<unknown, unknown>> = Object.fromEntries(
	effects.map((e) => [e.name, e as EffectDefinition<unknown, unknown>]),
);

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

	// 「状態を変えた」とみなす effect
	const STATE_CHANGING_EFFECTS = new Set([
		"file.create",
		"file.insertAt",
		"file.patch",
		"git.clone",
		"git.checkout",
		"shell.exec",
	]);

	const MAX_TURNS = 20;

	let nextEffectName: string | null = null;

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
				nextEffectName = "task.plan";
				hasPlanned = true;
			} else if (stagnationCount === 1 && !hasSplit && taskStack.length === 1) {
				/**
				 * 初期停滞時のみ task.split を許可する。
				 * これにより粒度過多タスクの分解はできるが、
				 * 無限 split ループは防止される。
				 */
				nextEffectName = "task.split";
				hasSplit = true;
			} else {
				/**
				 * 通常時は次の action 選択を LLM に委ねる。
				 * ただし task.check はここでは選ばせない。
				 */
				nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? null;

				if (nextEffectName === "task.check") {
					nextEffectName = null;
				}
			}

			// fallback（何も選ばれなかった場合）
			if (!nextEffectName) {
				nextEffectName = "task.wait";
			}

			// --- effect 実行 ---
			await orchestrator.dispatch(registry[nextEffectName], nextEffectName, currentTask);

			// --- task.check は「状態変化の直後」にのみ自動発火 ---
			if (STATE_CHANGING_EFFECTS.has(nextEffectName)) {
				/**
				 * task.check は検証であり思考ではない。
				 * そのため「世界が変わった直後」にのみ実行する。
				 */
				await orchestrator.dispatch(registry["task.check"], "task.check", currentTask);
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
