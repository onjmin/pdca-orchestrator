import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { orchestrator } from "../core/orchestrator";
import { taskStack } from "../core/stack-manager";
import { theorize } from "../effects/ai/theorize";
import { create } from "../effects/file/create";
import { grep } from "../effects/file/grep";
import { insertAt } from "../effects/file/insert_at";
import { listTree } from "../effects/file/list_tree";
import { patch } from "../effects/file/patch";
import { readLines } from "../effects/file/read_lines";
import { checkout } from "../effects/git/checkout";
import { clone } from "../effects/git/clone";
import { createPullRequest } from "../effects/github/create-pull-request";
import { exec } from "../effects/shell/exec";
import { check } from "../effects/task/check";
import { plan } from "../effects/task/plan";
import { split } from "../effects/task/split";
import { wait } from "../effects/task/wait";
import type { EffectDefinition } from "../effects/types";
import { fetchContent } from "../effects/web/fetch";
import { search as webSearch } from "../effects/web/search";
import { wikipedia } from "../effects/web/wikipedia";

// 利用可能なエフェクトのカタログ
const effects = [
	listTree,
	check,

	clone,
	checkout,

	plan,
	split,
	theorize,

	grep,
	readLines,
	create,
	insertAt,
	patch,
	exec,
	wait,

	webSearch,
	wikipedia,
	fetchContent,

	createPullRequest,
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
	let stagnationCount = 0;
	let totalTurns = 0;
	let lastEffectName: string | null = null;

	const MAX_STAGNATION = 2;
	const MAX_TURNS = 20;

	let nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			const beforeProgress = taskStack.progress;

			// --- effect 選択（機械主導） ---
			if (!hasPlanned) {
				// タスク開始時に必ず全体計画を立てさせる
				nextEffectName = "task.plan";
				hasPlanned = true;
			} else if (stagnationCount === 1 && taskStack.length === 1) {
				// 停滞初期はタスク構造を見直す
				nextEffectName = "task.split";
			} else if (
				lastEffectName !== "task.check" &&
				(stagnationCount >= MAX_STAGNATION || totalTurns >= MAX_TURNS)
			) {
				// 無限ループ防止の最終診断
				nextEffectName = "task.check";
				stagnationCount = 0;
			} else {
				// 停滞していない間は LLM に委ねる
				nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";
			}

			// --- effect 実行 ---
			await orchestrator.dispatch(registry[nextEffectName], nextEffectName, currentTask);
			lastEffectName = nextEffectName;

			// --- 進捗評価 ---
			const afterProgress = taskStack.progress;
			stagnationCount = afterProgress === beforeProgress ? stagnationCount + 1 : 0;
		}
	} finally {
		console.log("--- 小人が道具を片付けて寝ます ---");
	}
}

main().catch((err) => {
	console.error(err);
});
