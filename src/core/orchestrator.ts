// ここで各エフェクトをインポート（本来は動的インポートが理想）
import { analyze } from "../effects/ai/analyze";
import { check } from "../effects/task/check";
import { plan } from "../effects/task/plan";
import { split } from "../effects/task/split";
import { notify } from "../effects/web/notify";
import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

// 利用可能なエフェクトのカタログ
const registry: Record<string, any> = {
	"task.check": check,
	"task.plan": plan,
	"task.split": split,
	"web.notify": notify,
	"ai.analyze": analyze,
	// "file.write": write, // 追加すれば勝手にLLMが選択肢に含める
};

export const orchestrator = {
	// 最新のEffect実行結果を保持するバッファ
	lastEffectResult: null as any,

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(): Promise<string> {
		const stack = taskStack.getStack();
		if (stack.length === 0) return "";

		const currentTask = stack[stack.length - 1];

		// 1. インメモリ情報の取り出し（不変の目標）
		const taskInfo = `
Current Task: ${currentTask.title}
Description: ${currentTask.description}
DoD: ${currentTask.dod}
Strategy: ${currentTask.strategy || "None (Need to plan?)"}
Reasoning: ${currentTask.reasoning || "None"}
        `.trim();

		// 2. ツール一覧の整形（選択肢）
		const tools = Object.entries(registry)
			.map(([name, eff]) => `- ${name}: ${eff.description}`)
			.join("\n");

		// 3. 直近の実行結果（流動的なデータ）
		// 巨大すぎるデータはここでカットして影響を最小限にする
		const rawObservation = this.lastEffectResult
			? JSON.stringify(this.lastEffectResult, null, 2)
			: "No previous action.";
		const observation =
			rawObservation.length > 2000
				? rawObservation.substring(0, 2000) + "... (truncated)"
				: rawObservation;

		// 4. 最終的なプロンプト構成
		const prompt = `
You are an autonomous agent.

### Goal and Strategy
${taskInfo}

### Available Effects
${tools}

### Observation from Previous Step
${observation}

### Instruction
Based on the current task, strategy, and observation, which effect should you execute next? 
Respond with only the effect name.
        `.trim();

		console.log(`[Brain] Choosing next step for: ${currentTask.title}`);

		// ここで LLM API を叩く
		const nextEffect = await llm.completeAsJson(prompt);
		return nextEffect;
	},
	/**
	 * 2. 選ばれたエフェクトを実行する（引数生成 + 実行）
	 */
	async dispatch(effectName: string, task: Task): Promise<any> {
		const effect = registry[effectName];
		if (!effect) throw new Error(`Effect not found: ${effectName}`);

		// --- [LLM CALL 2: ARGUMENT GENERATION] ---
		// プロンプト案:
		// 「ツール ${effectName} を実行します。説明: ${effect.description}」
		// 「以下のスキーマに従って JSON 引数を生成してください: ${JSON.stringify(effect.inputSchema)}」

		// 仮の引数（本来はLLMが生成する）
		const dummyArgs: any = {
			observations: "The directory is empty. No files found.",
			isPassed: false,
		};

		// 原子的な実行
		const result = await effect.handler(dummyArgs);

		// 結果をそのままインメモリに保存
		// 成功・失敗に関わらず、起きたことすべてを「知見」にする
		this.lastEffectResult = {
			effectName,
			summary: result.summary,
			data: result.data, // ファイルの中身や実行ログなど
			success: result.success,
		};

		return result;
	},
};
