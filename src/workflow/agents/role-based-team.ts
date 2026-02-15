import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { llm } from "../../core/llm-client";
import { orchestrator } from "../../core/orchestrator";
import { taskStack } from "../../core/stack-manager";
import { aiTroubleshootTool } from "../../tools/ai/troubleshoot";
import { fileCreateTool } from "../../tools/file/create";
import { fileGrepTool } from "../../tools/file/grep";
import { fileInsertAtTool } from "../../tools/file/insert_at";
import { fileListTreeTool } from "../../tools/file/list_tree";
import { filePatchTool } from "../../tools/file/patch";
import { fileReadLinesTool } from "../../tools/file/read_lines";
import { shellExecTool } from "../../tools/shell/exec";
import { taskCheckTool } from "../../tools/task/check";
import { taskPlanTool } from "../../tools/task/plan";
import { taskSplitTool } from "../../tools/task/split";
import { emitDiscordInternalLog } from "../../tools/task/utils";

type Role = "planner" | "researcher" | "builder" | "reviewer" | "critic";

interface TeamMember {
	role: Role;
	description: string;
	tools: string[];
}

const roleDescriptions: Record<Role, string> = {
	planner: "戦略を立案し、タスクを分配するリーダー",
	researcher: "情報を調査・収集するリサーチャー",
	builder: "コードを実装・作成するエンジニア",
	reviewer: "品質を検査・確認するレビュアー",
	critic: "他のメンバーの提案を批判的に検証し、弱点があれば差し戻す",
};

const roleTools: Record<Role, string[]> = {
	planner: [taskPlanTool.name, taskSplitTool.name, fileListTreeTool.name],
	researcher: [fileGrepTool.name, fileReadLinesTool.name, "web.search", "web.fetch"],
	builder: [fileCreateTool.name, fileInsertAtTool.name, filePatchTool.name, shellExecTool.name],
	reviewer: [taskCheckTool.name, aiTroubleshootTool.name, shellExecTool.name],
	critic: [aiTroubleshootTool.name, fileGrepTool.name],
};

const allTools = [
	aiTroubleshootTool,
	fileCreateTool,
	fileGrepTool,
	fileInsertAtTool,
	fileListTreeTool,
	filePatchTool,
	fileReadLinesTool,
	shellExecTool,
	taskCheckTool,
	taskPlanTool,
	taskSplitTool,
];

const allRegistry = new Map(allTools.map((e) => [e.name, e]));

export async function run() {
	console.log("--- チーム職人が起きました（批判者付き） ---");

	const goalPath = resolve(process.cwd(), "GOAL.md");
	let goalContent = "";

	try {
		goalContent = await fs.readFile(goalPath, "utf-8");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`[CRITICAL] Failed to load GOAL: ${msg}`);
	}

	const team: TeamMember[] = [
		{ role: "planner", description: roleDescriptions.planner, tools: roleTools.planner },
		{ role: "researcher", description: roleDescriptions.researcher, tools: roleTools.researcher },
		{ role: "builder", description: roleDescriptions.builder, tools: roleTools.builder },
		{ role: "reviewer", description: roleDescriptions.reviewer, tools: roleTools.reviewer },
		{ role: "critic", description: roleDescriptions.critic, tools: roleTools.critic },
	];

	console.log("👥 チーム編成:");
	for (const member of team) {
		console.log(`  - ${member.role}: ${member.description}`);
	}

	const goal = parseGoal(goalContent);
	taskStack.push({
		title: goal.title,
		description: goal.description,
		dod: goal.dod,
		turns: 0,
	});

	await emitDiscordInternalLog(
		"info",
		`👥 **Team Started** - ${goal.title}\n\nTeam: ${team.map((m) => m.role).join(", ")}`,
	);

	let turn = 0;
	const MAX_TURNS = 80;

	try {
		while (!taskStack.isEmpty()) {
			turn++;
			console.log(`\n🏭 ターン ${turn} ---`);

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			currentTask.turns++;

			await emitDiscordInternalLog(
				"info",
				`🔄 **Turn ${turn}** - Current Task: ${currentTask.title}`,
			);

			orchestrator.oneTimeInstruction = `
You are leading a team to accomplish the goal. First, analyze the goal and decide if it needs to be split into smaller sub-tasks.
If the goal is complex, use 'task.split' to break it down.
Then execute the team workflow (plan -> research -> build -> review) for each sub-task.
`.trim();

			const nextTool = await orchestrator.selectNextTool(allRegistry);

			if (!nextTool) {
				console.log("❌ ツールが選択できませんでした");
				break;
			}

			console.log(`🔧 選択されたツール: ${nextTool.name}`);

			await orchestrator.dispatch(nextTool, currentTask);

			const context = buildContext();
			console.log(`📊 Context: ${context.substring(0, 100)}...`);

			if (nextTool === taskSplitTool) {
				console.log("📋 タスク分割が発生しました");
				const stack = taskStack.getStack();
				console.log(`   スタックサイズ: ${stack.length}`);
			}

			const checkResult = await verifyWithReviewer(goal, context);
			if (!checkResult.success) {
				console.log(`⚠️ レビュー指摘: ${checkResult.message}`);
				orchestrator.oneTimeInstruction = `Previous work had issues: ${checkResult.message}. Fix and retry.`;
				await orchestrator.dispatch(taskCheckTool, currentTask);
			}

			if (turn >= MAX_TURNS) {
				throw new Error("Max turns exceeded");
			}
		}
	} finally {
		await emitDiscordInternalLog("success", "🏁 **Team Finished**");
		console.log("--- チームが解散しました ---");
	}
}

function buildContext(): string {
	const parts: string[] = [];

	if (orchestrator.lastControlSnapshot) {
		const { chosenTool, rationale } = orchestrator.lastControlSnapshot;
		parts.push(`Last Action: ${chosenTool || "none"}`);
		parts.push(`Rationale: ${rationale}`);
	}

	if (orchestrator.lastToolParameters) {
		parts.push(`Parameters: ${JSON.stringify(orchestrator.lastToolParameters)}`);
	}

	if (orchestrator.lastToolResult) {
		parts.push(`Result: ${orchestrator.lastToolResult}`);
	}

	for (const record of orchestrator.observationHistory) {
		parts.push(`History[${record.chosenTool}]: ${record.result.substring(0, 100)}`);
	}

	return parts.join("\n");
}

async function verifyWithReviewer(
	goal: { title: string; description: string; dod: string },
	context: string,
): Promise<{ success: boolean; message: string }> {
	const prompt = `
You are the REVIEWER role. Verify if the current work aligns with the goal.

GOAL:
${goal.title}
${goal.description}
${goal.dod}

Current Context:
${context}

Respond with:
- "OK" if the work is progressing correctly
- Specific issues that need to be fixed
`.trim();

	const result = await llm.complete(prompt);

	if (result.includes("OK") || result.includes("Success")) {
		return { success: true, message: "" };
	}

	return { success: false, message: result };
}

function parseGoal(content: string): { title: string; description: string; dod: string } {
	const parts = content.split("---").map((s) => s.trim());
	if (parts.length !== 3) {
		throw new Error("Invalid GOAL format");
	}
	return { title: parts[0], description: parts[1], dod: parts[2] };
}
