import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { initDebugLog, isDebugMode, setLogTurn } from "../../core/debug-log";
import { emitDiscordWebhook } from "../../core/discord-webhook";
import { orchestrator } from "../../core/orchestrator";
import { taskStack } from "../../core/stack-manager";
import { aiTroubleshootTool } from "../../tools/ai/troubleshoot";
import { fileCreateTool } from "../../tools/file/create";
import { fileGrepTool } from "../../tools/file/grep";
import { fileInsertAtTool } from "../../tools/file/insert_at";
import { fileListTreeTool } from "../../tools/file/list_tree";
import { filePatchTool } from "../../tools/file/patch";
import { fileReadLinesTool } from "../../tools/file/read_lines";
import { gitCheckoutTool } from "../../tools/git/checkout";
import { gitCloneTool } from "../../tools/git/clone";
import { githubCreatePullRequestTool } from "../../tools/github/create-pull-request";
import { shellExecTool } from "../../tools/shell/exec";
import { taskCheckTool } from "../../tools/task/check";
import { taskPlanTool } from "../../tools/task/plan";
import { taskSplitTool } from "../../tools/task/split";
import { taskWaitTool } from "../../tools/task/wait";
import { webFetchTool } from "../../tools/web/fetch";
import { webSearchTool } from "../../tools/web/search";
import { webWikipediaTool } from "../../tools/web/wikipedia";

const allTools = [
	aiTroubleshootTool,
	fileCreateTool,
	fileGrepTool,
	fileInsertAtTool,
	fileListTreeTool,
	filePatchTool,
	fileReadLinesTool,
	gitCheckoutTool,
	gitCloneTool,
	githubCreatePullRequestTool,
	shellExecTool,
	taskCheckTool,
	taskPlanTool,
	taskSplitTool,
	taskWaitTool,
	webFetchTool,
	webSearchTool,
	webWikipediaTool,
];

type AllTool = (typeof allTools)[number];
const allRegistry = new Map(allTools.map((e) => [e.name, e]));

/**
 * 変更系Tools (Mutating Tools)
 * ファイルの書き換え、外部環境の操作、プロセス待機など
 */
const mutatingTools = new Set<AllTool>([
	fileCreateTool,
	fileInsertAtTool,
	filePatchTool,
	gitCloneTool,
	gitCheckoutTool,
	taskWaitTool, // 状態が変化する可能性があるためこちらに分類
]);

/**
 * 観察系Tools (Observation Tools)
 * 読み取り、検索、解析など
 */
const observationTools = new Set<AllTool>([fileGrepTool, fileListTreeTool, fileReadLinesTool]);
const observationRegistry = new Map([...observationTools].map((e) => [e.name, e]));

export async function run() {
	console.log("--- 小人が起きました ---");

	await emitDiscordWebhook(
		"# 🎬 タスク分解開始\n\nタスク分解エージェントが目標の処理を開始しました。",
	);

	// 初期タスク読み込み
	const goalPath = resolve(process.cwd(), "GOAL.md");
	let initialTask = {
		title: "Initial Goal",
		description: "Establish the development environment.",
		dod: "Goal achieved.",
		turns: 0,
	};

	try {
		const rawContent = await fs.readFile(goalPath, "utf-8");
		const parts = rawContent.split("---").map((s) => s.trim());

		if (parts.length !== 3) {
			throw new Error(`⚠️ GOAL file format is invalid. Found ${parts.length} parts.`);
		}

		const [title, description, dod] = parts;
		initialTask = { title, description, dod, turns: 0 };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`[CRITICAL] Failed to initialize task: ${msg}`);
	}

	taskStack.push(initialTask);

	let totalTurns = 0;
	const MAX_TURNS = 64;
	initDebugLog();

	let observationsAfterMutating = 0;

	let nextTool: AllTool | null = null;
	let lastSelectedTool: AllTool | null = null;

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

			nextTool = await (async () => {
				// const isInitialParentTask = taskStack.currentTask === initialTask;

				// 強制介入: 現状把握（全タスク共通の1ターン目）
				if (currentTask.turns === 1) {
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				// 強制介入: 計画の強制（2ターン目）
				if (currentTask.turns === 2) {
					orchestrator.oneTimeInstruction =
						"Analyze the goal and formulate a clear strategy. Use 'task.plan' to document your step-by-step approach before taking action.";
					// task.planを確実に選ばせるなら、plan用のRegistryを渡すのもアリ
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				// 強制介入: 分割の検討（3ターン目）
				if (currentTask.turns === 3) {
					orchestrator.oneTimeInstruction = `
[DECIDE: SPLIT OR EXECUTE]
Review your strategy. 
1. If the current task still requires multiple distinct steps, you MUST use 'task.split' to break it down into unambiguous, single-purpose sub-tasks.
2. If the current task is already simple enough to be completed with a single action (e.g., just creating one file), you may skip splitting and proceed to execute.
    `.trim();
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				// 強制介入: DoDチェック失敗時、タスク分割を検討させる
				if (currentTask.turns !== 1 && lastSelectedTool === taskCheckTool) {
					orchestrator.oneTimeInstruction =
						"Evaluate if the current DoD is simple enough to be completed in a single step. If it feels complex or multi-faceted, use 'task.split' to break it down into smaller, manageable sub-tasks.";
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				// 強制介入: 前ターンが変更系Toolsであれば、観察系Toolsを選出
				if (lastSelectedTool && mutatingTools.has(lastSelectedTool)) {
					observationsAfterMutating++;
					orchestrator.oneTimeInstruction = `Verify that the changes made by '${lastSelectedTool.name}' were applied correctly and that the results align with the expected state.`;
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				// 強制介入: 上のルールが規定回数以上発動していれば、DoDチェック
				if (observationsAfterMutating > 3) {
					observationsAfterMutating = 0;
					orchestrator.recordControlSnapshot({
						chosenTool: taskCheckTool.name,
						rationale:
							"Sufficient observations have been conducted following modifications. Transitioning to final task verification (DoD).",
					});
					return taskCheckTool;
				}

				// 通常
				return (await orchestrator.selectNextTool(allRegistry)) ?? null;
			})();

			if (!nextTool) {
				// 不正なツールはlsに丸め込む
				nextTool = fileListTreeTool;
			}

			// --- tool 実行 ---
			await orchestrator.dispatch(nextTool, currentTask);
			lastSelectedTool = nextTool;

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}
		}
	} finally {
		console.log("--- 小人が道具を片付けて寝ます ---");

		await emitDiscordWebhook("# 🏁 タスク分解完了\n\nタスク分解エージェントが完了しました。");
	}
}
