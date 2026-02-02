import { actMode } from "./modes/act";
import { checkMode } from "./modes/check";
import { doMode } from "./modes/do";
import { planMode } from "./modes/plan";
import type { PDCAContext, PDCAState, Task } from "./types";

export async function runPDCA(task: Task) {
	let context: PDCAContext = {
		task,
		state: "PLAN", // 初期状態
		history: [],
		summary: "",
		isGoalReached: false,
		cycleCount: 0,
		stepCount: 0,
	};

	console.log(`[Mission Start]: ${task.prompt}`);

	// 各モードの関数をマッピング
	const modeHandlers: Record<PDCAState, (ctx: PDCAContext) => Promise<PDCAContext>> = {
		PLAN: planMode,
		DO: doMode,
		CHECK: checkMode,
		ACT: actMode,
		FINISHED: async (ctx) => ctx, // FINISHED時は何もしない
	};

	const MAX_CYCLES = 10;

	while (context.state !== "FINISHED") {
		const handler = modeHandlers[context.state];

		if (!handler) {
			console.error(`Unknown state: ${context.state}`);
			break;
		}

		// PLANに戻るタイミングを1サイクルの区切りとする
		if (context.state === "PLAN") {
			context.cycleCount++;
			if (context.cycleCount > MAX_CYCLES) {
				console.error("Critical: Maximum cycles reached.");
				context.state = "FINISHED";
				break;
			}
		}

		// モード遷移ごとにステップカウントをリセット
		context.stepCount = 0;

		console.log(`\n>>> [Cycle:${context.cycleCount}] Transitioned to [${context.state}]`);

		// 各モードの実行（内部で context.state が書き換えられる）
		context = await handler(context);
	}

	console.log("\n[Mission Finished]");
	return context;
}
