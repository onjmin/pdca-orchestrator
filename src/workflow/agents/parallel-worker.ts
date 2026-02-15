import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { initDebugLog, isDebugMode, setLogTurn } from "../../core/debug-log";
import { orchestrator } from "../../core/orchestrator";
import { taskStack } from "../../core/stack-manager";
import { fileCreateTool } from "../../tools/file/create";
import { fileGrepTool } from "../../tools/file/grep";
import { fileInsertAtTool } from "../../tools/file/insert_at";
import { fileListTreeTool } from "../../tools/file/list_tree";
import { filePatchTool } from "../../tools/file/patch";
import { fileReadLinesTool } from "../../tools/file/read_lines";
import { shellExecTool } from "../../tools/shell/exec";
import { taskSplitTool } from "../../tools/task/split";

const parallelTools = [
	fileCreateTool,
	fileGrepTool,
	fileInsertAtTool,
	filePatchTool,
	fileReadLinesTool,
	shellExecTool,
];

type ParallelTool = (typeof parallelTools)[number];
const parallelRegistry = new Map(parallelTools.map((e) => [e.name, e]));

export async function run() {
	console.log("--- 並列職人が起きました ---");

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
	const MAX_PARALLEL = 3;
	initDebugLog();

	let isPlanning = true;
	let lastPhase = "";

	try {
		while (!taskStack.isEmpty()) {
			totalTurns++;

			if (isDebugMode) {
				console.log(`${totalTurns}ターン目`);
				setLogTurn(totalTurns);
			}

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			currentTask.turns++;

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}

			if (isPlanning) {
				orchestrator.oneTimeInstruction = `
Analyze the goal and create a detailed plan.
Use 'task.split' to break it down into the SMALLEST possible independent subtasks.
Each subtask should be executable in parallel with others.
Make at least 3-5 subtasks for parallel execution.
`.trim();

				const splitTool = taskSplitTool;
				await orchestrator.dispatch(splitTool, currentTask);

				const stack = taskStack.getStack();

				if (stack.length > 1) {
					console.log(`📋 分割完了: ${stack.length}個のサブタスクに分割`);
					lastPhase = "planning";
					isPlanning = false;
				}
				continue;
			}

			const stack = taskStack.getStack();

			if (stack.length >= 2 && lastPhase !== "executing") {
				console.log(`⚡ 並列実行モード: ${stack.length}タスクを準備`);
				lastPhase = "executing";
			}

			if (lastPhase === "executing" && stack.length > 1) {
				const parallelCount = Math.min(MAX_PARALLEL, stack.length - 1);
				console.log(`⚡ ${parallelCount}タスクを並列実行...`);

				const promises: Array<Promise<void>> = [];

				for (let i = 0; i < parallelCount; i++) {
					if (taskStack.length <= 1) break;

					const task = taskStack.currentTask;
					if (!task) break;

					const promise = (async () => {
						const tool = (await orchestrator.selectNextTool(parallelRegistry)) as ParallelTool;
						await orchestrator.dispatch(tool, task);
						taskStack.pop();
					})();

					promises.push(promise);
				}

				if (promises.length > 0) {
					await Promise.all(promises);
					continue;
				}
			}

			const tool = (await orchestrator.selectNextTool(parallelRegistry)) as ParallelTool;
			await orchestrator.dispatch(tool, currentTask);
		}
	} finally {
		console.log("--- 並列職人が道具を片付けて寝ます ---");
	}
}
