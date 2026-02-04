import "dotenv/config";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { orchestrator } from "../core/orchestrator";
import { taskStack } from "../core/stack-manager";
import { theorize } from "../effects/ai/theorize";
import { grep } from "../effects/file/grep";
import { list } from "../effects/file/list";
import { move } from "../effects/file/move";
import { patch } from "../effects/file/patch";
import { read } from "../effects/file/read";
import { remove } from "../effects/file/remove";
import { search as fileSearch } from "../effects/file/search";
import { tree } from "../effects/file/tree";
import { write } from "../effects/file/write";
import { checkout } from "../effects/git/checkout";
import { clone } from "../effects/git/clone";
import { createPullRequest } from "../effects/github/create-pull-request";
import { complain } from "../effects/master/complain";
import { requestTool } from "../effects/master/request_tool";
import { exec } from "../effects/shell/exec";
import { check } from "../effects/task/check";
import { plan } from "../effects/task/plan";
import { report } from "../effects/task/report";
import { split } from "../effects/task/split";
import { wait } from "../effects/task/wait";
import type { EffectDefinition } from "../effects/types";
import { fetchContent } from "../effects/web/fetch";
import { search as webSearch } from "../effects/web/search";
import { wikipedia } from "../effects/web/wikipedia";

// 利用可能なエフェクトのカタログ
const effects = [
	// 1. 認知：現在の状況・場所を知る（まずここを見ろ）
	list,
	tree,
	read,
	check,

	// 2. 準備：作業の土台を整える（土俵に上がる）
	clone, // リポジトリを持ってくる
	checkout, // 適切なブランチに切り替える

	// 3. 思考：どう動くかを計画する
	plan,
	split,
	theorize,

	// 4. 実行：実際に手を動かす（メインの手足）
	write,
	patch,
	remove, // ファイル操作はここにまとめる
	move,
	exec,
	grep,
	fileSearch,
	wait,

	// 5. 補完：外部知識を取り入れる
	webSearch,
	wikipedia,
	fetchContent,

	// 6. 報告：成果を提出し、完了させる
	createPullRequest, // 最も重要な「仕事の出口」
	report, // 内部的な完了報告

	// 7. レスキュー：人間への相談
	complain,
	requestTool,
];

const registry: Record<string, EffectDefinition<unknown, unknown>> = Object.fromEntries(
	effects.map((e) => [e.name, e as EffectDefinition<unknown, unknown>]),
);

async function main() {
	console.log("--- 小人が起きました ---");

	// 1. 初手のタスク投入 (GOAL ファイルから読み込む)
	const goalPath = resolve(process.cwd(), "GOAL");
	let initialTask = {
		title: "Initial Goal",
		description: "Establish the development environment.",
		dod: "Goal achieved.",
	};

	try {
		const rawContent = await fs.readFile(goalPath, "utf-8");
		const parts = rawContent.split("---").map((s) => s.trim());

		if (parts.length !== 3) {
			throw new Error(
				`⚠️ GOAL file format is invalid. Found ${parts.length} parts, but exactly 3 parts separated by '---' are required.`,
			);
		}

		const [title, description, dod] = parts;
		initialTask = { title, description, dod };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`[CRITICAL] Failed to initialize task: ${msg}`);
	}

	taskStack.push(initialTask);

	// 2. 初手のエフェクトを選択
	let nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";

	// --- メインループ ---
	try {
		while (!taskStack.isEmpty()) {
			const currentTask = taskStack.currentTask;
			if (!currentTask) break;

			// 3. 選択されたエフェクトを実行
			await orchestrator.dispatch(registry[nextEffectName], nextEffectName, currentTask);

			// 4. 次の一手をLLMに再選択させる
			nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";
		}
	} finally {
		// 5. 後片付け (正常終了・異常終了に関わらず実行)
		console.log("--- 小人が道具を片付けて寝ます ---");
	}
}

main().catch((err) => {
	console.error(err);
});
