import "dotenv/config";
import { orchestrator } from "../core/orchestrator";
import { taskStack } from "../core/stack-manager";
import { theorize } from "../effects/ai/theorize";
import { del } from "../effects/file/delete";
import { grep } from "../effects/file/grep";
import { list } from "../effects/file/list";
import { move } from "../effects/file/move";
import { patch } from "../effects/file/patch";
import { pwd } from "../effects/file/pwd";
import { read } from "../effects/file/read";
import { search as fileSearch } from "../effects/file/search";
import { tree } from "../effects/file/tree";
import { write } from "../effects/file/write";
import { setupBranch } from "../effects/github/setup_branch";
import { submitWork } from "../effects/github/submit_work";
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
	// 1. 最優先：現在の状況を「認知」するためのツール（まずはここを見ろ）
	pwd,
	list,
	tree,
	read, // 自分の立ち位置と中身を知る
	check, // タスクの現状を確認する

	// 2. 次点：どう動くかを「計画・思考」するためのツール
	plan,
	split, // 計画を立てる・分ける
	theorize, // 理論的に深く考える

	// 3. 実行：実際に「作用」を及ぼすツール（メインの手足）
	write,
	patch, // 書く・直す
	exec, // コマンド実行（重い武器）
	grep,
	fileSearch, // 広範囲の探索
	wait, // 同期のための待機

	// 4. 外部：知識を「補完」するためのツール
	webSearch,
	wikipedia,
	fetchContent, // ググる・調べる

	// 5. 報告：成果を「確定」させるツール
	report, // 仕事の完了報告
	setupBranch,
	submitWork, // リモートへの反映

	// 6. メタ：例外的な「レスキュー」ツール（最後の手）
	complain,
	requestTool, // 人間への泣きつき・機能要望
	del,
	move, // 破壊的・整理操作
];

const registry: Record<string, EffectDefinition<unknown, unknown>> = Object.fromEntries(
	effects.map((e) => [e.name, e as EffectDefinition<unknown, unknown>]),
);

async function main() {
	// 1. 初手のタスク投入 (ここは基盤側で行う)
	taskStack.push({
		title: "Initial Goal",
		description: process.argv[2] || "Establish the development environment.",
		dod: "Goal achieved.",
	});

	// 2. 初手のエフェクトを選択 (LLMがスタックを見て "task.check" を選ぶ)
	let nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";

	while (!taskStack.isEmpty()) {
		const currentTask = taskStack.currentTask;
		if (!currentTask) break;

		// 3. 選択されたエフェクトを原子的に実行
		// (この内部で taskStack.push/pop やファイル操作が行われる)
		await orchestrator.dispatch(registry[nextEffectName], nextEffectName, currentTask);

		// 4. 実行後の「最新の状態」を見て、次の一手をLLMに再選択させる
		// ここで task.plan に行くか、file.write に行くかをLLMが毎回決める
		nextEffectName = (await orchestrator.selectNextEffect(registry)) ?? "task.check";
	}
}

main().catch(console.error);
