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

const mutatingTools = new Set<AllTool>([
	fileCreateTool,
	fileInsertAtTool,
	filePatchTool,
	gitCloneTool,
	gitCheckoutTool,
	taskWaitTool,
	shellExecTool,
]);

const observationTools = new Set<AllTool>([
	fileGrepTool,
	fileListTreeTool,
	fileReadLinesTool,
	webFetchTool,
	webSearchTool,
	webWikipediaTool,
]);
const observationRegistry = new Map([...observationTools].map((e) => [e.name, e]));

const planningTools = new Set<AllTool>([taskPlanTool, taskSplitTool]);
const planningRegistry = new Map([...planningTools].map((e) => [e.name, e]));

export async function run() {
	console.log("--- OpenCode Agent 起動 ---");

	await emitDiscordWebhook(
		"# 🤖 OpenCode Agent 開始\n\n自律エージェントが目標の処理を開始しました。",
	);

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
	const MAX_TURNS = 128;
	initDebugLog();

	let consecutiveObservations = 0;
	let lastSelectedTool: AllTool | null = null;
	let needsPlan = true;
	let needsSplit = false;

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

			let nextTool: AllTool | null = await (async () => {
				if (currentTask.turns === 1) {
					orchestrator.oneTimeInstruction =
						"First, understand the current environment and codebase structure. Use observation tools (file listing, reading, grep) to gather information about the project state.";
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				if (needsPlan && currentTask.turns === 2) {
					orchestrator.oneTimeInstruction =
						"Analyze the goal and create a detailed execution plan using 'task.plan'. Break down the goal into actionable steps with clear verification criteria.";
					needsPlan = false;
					return (await orchestrator.selectNextTool(planningRegistry)) ?? null;
				}

				if (needsSplit) {
					orchestrator.oneTimeInstruction =
						"The current task is complex. Break it down into smaller, manageable sub-tasks using 'task.split' to ensure each piece can be completed independently.";
					needsSplit = false;
					return (await orchestrator.selectNextTool(planningRegistry)) ?? null;
				}

				if (lastSelectedTool && mutatingTools.has(lastSelectedTool)) {
					consecutiveObservations++;
					orchestrator.oneTimeInstruction =
						"After the mutation, verify the changes were applied correctly. Check file contents, run commands, or search for specific patterns to confirm the expected state.";
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				if (lastSelectedTool === taskCheckTool) {
					orchestrator.oneTimeInstruction =
						"Task verification complete. If DoD is met, proceed to next task. If not, continue executing the current task or split it if needed.";
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				if (consecutiveObservations >= 2) {
					consecutiveObservations = 0;
					orchestrator.oneTimeInstruction =
						"Based on your observations, determine the next action. If changes are needed, proceed with mutations. If the task appears complete, use 'task.check' to verify DoD.";
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				orchestrator.oneTimeInstruction =
					"Determine the best next action based on the current task state. Use mutation tools to make changes, or observation tools to gather more information if needed.";
				return (await orchestrator.selectNextTool(allRegistry)) ?? null;
			})();

			if (!nextTool) {
				nextTool = fileListTreeTool;
			}

			await orchestrator.dispatch(nextTool, currentTask);
			lastSelectedTool = nextTool;

			if (nextTool === taskPlanTool) {
				needsPlan = false;
			}

			if (nextTool === taskSplitTool) {
				const hasSubTasks = taskStack.length > 1;
				if (hasSubTasks) {
					needsPlan = true;
				}
			}

			if (lastSelectedTool === taskCheckTool) {
				const checkResult = orchestrator.lastControlSnapshot?.rationale;
				if (checkResult?.includes("passed")) {
					consecutiveObservations = 0;
					needsPlan = true;
				} else if (checkResult?.includes("failed")) {
					needsSplit = true;
				}
			}

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}
		}
	} finally {
		console.log("--- OpenCode Agent 終了 ---");

		await emitDiscordWebhook("# 🏁 OpenCode Agent 完了\n\n自律エージェントが完了しました。");
	}
}
