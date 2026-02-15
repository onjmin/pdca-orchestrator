import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { emitDiscordWebhook } from "../../core/discord-webhook";
import { llm } from "../../core/llm-client";
import { orchestrator } from "../../core/orchestrator";
import { taskStack } from "../../core/stack-manager";
import { truncateForPrompt } from "../../core/utils";
import { taskCheckTool } from "../../tools/task/check";

type Role = "planner" | "researcher" | "builder" | "reviewer" | "critic";
type Phase = "plan" | "research" | "build" | "review" | "done";

interface TeamMember {
	role: Role;
	description: string;
	tools: string[];
	completed: string[];
}

interface CriticFeedback {
	passed: boolean;
	targetRole: Role | null;
	reason: string;
}

const roleDescriptions: Record<Role, string> = {
	planner: "戦略を立案し、タスクを分配するリーダー",
	researcher: "情報を調査・収集するリサーチャー",
	builder: "コードを実装・作成するエンジニア",
	reviewer: "品質を検査・確認するレビュアー",
	critic: "他のメンバーの提案を批判的に検証し、弱点があれば差し戻す",
};

const roleTools: Record<Role, string[]> = {
	planner: ["task.plan", "task.split", "fileListTreeTool"],
	researcher: ["fileGrepTool", "fileReadLinesTool", "webSearchTool", "webFetchTool"],
	builder: ["fileCreateTool", "fileInsertAtTool", "filePatchTool", "shellExecTool"],
	reviewer: ["taskCheckTool", "aiTroubleshootTool", "shellExecTool"],
	critic: ["aiTroubleshootTool", "fileGrepTool"],
};

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
		{
			role: "planner",
			description: roleDescriptions.planner,
			tools: roleTools.planner,
			completed: [],
		},
		{
			role: "researcher",
			description: roleDescriptions.researcher,
			tools: roleTools.researcher,
			completed: [],
		},
		{
			role: "builder",
			description: roleDescriptions.builder,
			tools: roleTools.builder,
			completed: [],
		},
		{
			role: "reviewer",
			description: roleDescriptions.reviewer,
			tools: roleTools.reviewer,
			completed: [],
		},
		{
			role: "critic",
			description: roleDescriptions.critic,
			tools: roleTools.critic,
			completed: [],
		},
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

	let turn = 0;
	const MAX_TURNS = 80;
	const MAX_CRITIC_LOOPS = 3;

	try {
		while (!taskStack.isEmpty()) {
			turn++;
			console.log(`\n🏭 ターン ${turn} ---`);

			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			let currentPhase: Phase = "plan";
			let criticLoops = 0;

			while (currentPhase !== "done") {
				switch (currentPhase) {
					case "plan": {
						console.log("📋 計画フェーズ...");
						const plan = await teamPlan(goal, team);
						console.log(`  → 計画: ${truncateForPrompt(plan, 80)}`);

						await emitDiscordWebhook(`📋 **Planner's Plan**\n\n${plan}`);

						const feedback = await teamCritic(goal, team, "plan", plan);
						if (!feedback.passed && feedback.targetRole) {
							console.log(`⚠️ Critic: ${feedback.reason}`);
							await emitDiscordWebhook(`⚠️ **Critic Rejection**\n\n${feedback.reason}`);
							if (feedback.targetRole === "planner") {
								currentPhase = "plan";
								criticLoops++;
							}
						} else {
							console.log("✅ Critic: PASS");
							currentPhase = "research";
							criticLoops = 0;
						}
						break;
					}
					case "research": {
						console.log("🔍 研究フェーズ...");
						const researchResult = await teamResearch(goal, team);
						console.log(`  → 調査: ${truncateForPrompt(researchResult, 80)}`);

						await emitDiscordWebhook(`🔍 **Researcher's Findings**\n\n${researchResult}`);

						const feedback = await teamCritic(goal, team, "research", researchResult);
						if (!feedback.passed && feedback.targetRole) {
							console.log(`⚠️ Critic: ${feedback.reason}`);
							await emitDiscordWebhook(`⚠️ **Critic Rejection**\n\n${feedback.reason}`);
							if (feedback.targetRole === "researcher") {
								currentPhase = "research";
								criticLoops++;
							}
						} else {
							console.log("✅ Critic: PASS");
							currentPhase = "build";
							criticLoops = 0;
						}
						break;
					}
					case "build": {
						console.log("🔨 構築フェーズ...");
						const buildResult = await teamBuild(goal, team, "");
						console.log(`  → 構築: ${truncateForPrompt(buildResult, 80)}`);

						await emitDiscordWebhook(`🔨 **Builder's Implementation**\n\n${buildResult}`);

						const feedback = await teamCritic(goal, team, "build", buildResult);
						if (!feedback.passed && feedback.targetRole) {
							console.log(`⚠️ Critic: ${feedback.reason}`);
							await emitDiscordWebhook(`⚠️ **Critic Rejection**\n\n${feedback.reason}`);
							if (feedback.targetRole === "builder") {
								currentPhase = "build";
								criticLoops++;
							}
						} else {
							console.log("✅ Critic: PASS");
							currentPhase = "review";
							criticLoops = 0;
						}
						break;
					}
					case "review": {
						console.log("🔎 レビュー...");
						const reviewResult = await teamReview(goal, team, "");

						await emitDiscordWebhook(`🔎 **Reviewer's Assessment**\n\n${reviewResult}`);

						if (reviewResult.includes("OK") || reviewResult.includes("成功")) {
							console.log("🎉 チーム目標達成！");
							taskStack.pop();
							currentPhase = "done";
						} else {
							console.log("⚠️ レビュー指摘:", reviewResult);
							await emitDiscordWebhook(`⚠️ **Review Issues Found**\n\n${reviewResult}`);
							orchestrator.oneTimeInstruction = `Review feedback: ${reviewResult}. Fix the issues.`;
							await orchestrator.dispatch(taskCheckTool, currentTask);
							currentPhase = "build";
						}
						break;
					}
				}

				if (criticLoops >= MAX_CRITIC_LOOPS) {
					console.log("⚠️ Criticループ限界突破、次のフェーズへ");
					currentPhase = getNextPhase(currentPhase);
					criticLoops = 0;
				}
			}

			if (turn >= MAX_TURNS) {
				throw new Error("Max turns exceeded");
			}
		}
	} finally {
		console.log("--- チームが解散しました ---");
	}
}

function getNextPhase(current: Phase): Phase {
	const order: Phase[] = ["plan", "research", "build", "review"];
	const idx = order.indexOf(current);
	return order[(idx + 1) % order.length];
}

function parseGoal(content: string): { title: string; description: string; dod: string } {
	const parts = content.split("---").map((s) => s.trim());
	if (parts.length !== 3) {
		throw new Error("Invalid GOAL format");
	}
	return { title: parts[0], description: parts[1], dod: parts[2] };
}

async function teamPlan(
	goal: { title: string; description: string; dod: string },
	team: TeamMember[],
): Promise<string> {
	const teamInfo = team
		.filter((t) => t.role !== "critic")
		.map((t) => `${t.role}: ${t.description}`)
		.join("\n");

	const prompt = `
You are the PLANNER role in a development team.

Team members:
${teamInfo}

GOAL:
${goal.title}
${goal.description}
${goal.dod}

Create a brief plan (2-3 sentences) on how the team should approach this goal.
Focus on which roles should do what.
`.trim();

	return await llm.complete(prompt);
}

async function teamResearch(
	goal: { title: string; description: string; dod: string },
	team: TeamMember[],
): Promise<string> {
	const prompt = `
You are the RESEARCHER role. Your job is to gather information needed to accomplish the goal.

GOAL:
${goal.title}
${goal.description}

Provide a summary of what you would investigate and what information is needed.
List specific areas to research (files, docs, configs, etc.).
`.trim();

	return await llm.complete(prompt);
}

async function teamBuild(
	goal: { title: string; description: string; dod: string },
	team: TeamMember[],
	_research: string,
): Promise<string> {
	const prompt = `
You are the BUILDER role. Implement the solution to achieve the goal.

GOAL:
${goal.title}
${goal.description}

Describe what files you would create or modify, and what commands you would run.
`.trim();

	return await llm.complete(prompt);
}

async function teamReview(
	goal: { title: string; description: string; dod: string },
	team: TeamMember[],
	_buildResult: string,
): Promise<string> {
	const prompt = `
You are the REVIEWER role. Verify if the implementation meets the goal.

GOAL:
${goal.title}
${goal.dod}

Respond with either:
- "OK" if the goal appears to be met
- Specific issues that need to be fixed
`.trim();

	return await llm.complete(prompt);
}

async function teamCritic(
	goal: { title: string; description: string; dod: string },
	team: TeamMember[],
	phase: Phase,
	output: string,
): Promise<CriticFeedback> {
	const phaseDescriptions: Record<Phase, string> = {
		plan: "the planner's strategy",
		research: "the researcher's findings",
		build: "the builder's implementation plan",
		review: "the reviewer's assessment",
		done: "completed",
	};

	const prompt = `
You are the CRITIC role. Your job is to critically review other team members' work and identify weaknesses.

GOAL:
${goal.title}
${goal.description}

Review phase: ${phase}
Content to review:
${output}

Evaluate ${phaseDescriptions[phase]} critically.

Respond with EXACTLY one of these formats:
- "PASS" - if the work is acceptable
- "REJECT: <target_role>: <reason>" - if there are issues that need fixing
  - target_role must be one of: planner, researcher, builder, reviewer
  - reason must be specific and actionable

Examples:
- "PASS"
- "REJECT: researcher: Missing information about API endpoints"
- "REJECT: builder: No error handling specified"
`.trim();

	const result = await llm.complete(prompt);
	const trimmed = result.trim();

	if (trimmed.startsWith("PASS")) {
		return { passed: true, targetRole: null, reason: "" };
	}

	const match = trimmed.match(/REJECT: (\w+): (.+)/);
	if (match) {
		const targetRole = match[1] as Role;
		const reason = match[2];
		return { passed: false, targetRole, reason };
	}

	return { passed: true, targetRole: null, reason: "" };
}
