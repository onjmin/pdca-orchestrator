import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { initDebugLog, isDebugMode, setLogTurn } from "../../core/debug-log";
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
]);

const observationTools = new Set<AllTool>([fileGrepTool, fileListTreeTool, fileReadLinesTool]);
const observationRegistry = new Map([...observationTools].map((e) => [e.name, e]));

interface ExecutionResult {
	tool: AllTool;
	success: boolean;
	error?: string;
	feedback?: string;
}

export async function run() {
	console.log("--- 自己修正小人が起きました ---");

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
	const MAX_RETRIES = 3;
	initDebugLog();

	let lastExecutionResult: ExecutionResult | null = null;
	let consecutiveFailures = 0;
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
				if (currentTask.turns === 1) {
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				if (currentTask.turns === 2) {
					orchestrator.oneTimeInstruction =
						"Analyze the goal and formulate a clear strategy. Use 'task.plan' to document your step-by-step approach before taking action.";
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				if (currentTask.turns === 3) {
					orchestrator.oneTimeInstruction = `
[DECIDE: SPLIT OR EXECUTE]
Review your strategy. 
1. If the current task still requires multiple distinct steps, you MUST use 'task.split' to break it down into unambiguous, single-purpose sub-tasks.
2. If the current task is already simple enough to be completed with a single action (e.g., just creating one file), you may skip splitting and proceed to execute.
    `.trim();
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				if (lastSelectedTool === taskCheckTool) {
					const checkResult = lastExecutionResult;
					if (checkResult && !checkResult.success) {
						consecutiveFailures++;
						if (consecutiveFailures >= MAX_RETRIES) {
							orchestrator.oneTimeInstruction = `You have failed ${MAX_RETRIES} times. Analyze the error carefully and try a completely different approach. Use 'ai.troubleshoot' if needed.`;
							consecutiveFailures = 0;
						} else {
							orchestrator.oneTimeInstruction = `Previous attempt failed: ${checkResult.error || "Unknown error"}. Correct the issue and try again.`;
						}
					} else if (checkResult && checkResult.success) {
						consecutiveFailures = 0;
					}
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				if (lastSelectedTool && mutatingTools.has(lastSelectedTool)) {
					orchestrator.oneTimeInstruction = `Verify that the changes made by '${lastSelectedTool.name}' were applied correctly and that the results align with the expected state.`;
					return (await orchestrator.selectNextTool(observationRegistry)) ?? null;
				}

				if (lastSelectedTool === taskCheckTool) {
					orchestrator.oneTimeInstruction =
						"Evaluate if the current DoD is simple enough to be completed in a single step. If it feels complex or multi-faceted, use 'task.split' to break it down into smaller, manageable sub-tasks.";
					return (await orchestrator.selectNextTool(allRegistry)) ?? null;
				}

				return (await orchestrator.selectNextTool(allRegistry)) ?? null;
			})();

			if (!nextTool) {
				nextTool = fileListTreeTool;
			}

			const beforeState = await captureState();

			await orchestrator.dispatch(nextTool, currentTask);
			lastSelectedTool = nextTool;

			const afterState = await captureState();
			const executionResult: ExecutionResult = {
				tool: nextTool,
				success: true,
				feedback: `Before: ${beforeState.files.length} files, After: ${afterState.files.length} files`,
			};
			lastExecutionResult = executionResult;

			if (totalTurns >= MAX_TURNS) {
				throw new Error("Max turns exceeded — aborting to prevent infinite loop.");
			}
		}
	} finally {
		console.log("--- 小人が道具を片付けて寝ます ---");
	}
}

async function captureState(): Promise<{ files: string[]; gitStatus?: string }> {
	try {
		const baseDir = ".";
		const files = await fs.readdir(resolve(baseDir));
		return { files: files.sort() };
	} catch {
		return { files: [] };
	}
}

async function analyzeExecution(
	beforeState: { files: string[] },
	tool: AllTool,
	_result: unknown,
): Promise<ExecutionResult> {
	const afterState = await captureState();

	const addedFiles = afterState.files.filter((f) => !beforeState.files.includes(f));
	const removedFiles = beforeState.files.filter((f) => !afterState.files.includes(f));

	const hasChanges = addedFiles.length > 0 || removedFiles.length > 0;

	return {
		tool,
		success: hasChanges || mutatingTools.has(tool) === false,
		feedback: hasChanges
			? `Changed: ${addedFiles.join(", ")} | Removed: ${removedFiles.join(", ")}`
			: "No changes detected",
	};
}
