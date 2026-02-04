import { llm } from "./llm-client";
import { type Task, taskStack } from "./stack-manager";

export const orchestrator = {
	// 最新のEffect実行結果を保持するバッファ
	lastEffectResult: null as any,

	/**
	 * 1. 次に実行すべきエフェクトを1つ選ぶ（選択のみ）
	 */
	async selectNextEffect(registry: Record<string, any>): Promise<string | null> {
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
				? `${rawObservation.substring(0, 2000)}... (truncated)"`
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

		// completeAsJson ではなく、生のテキストを返す complete を使う
		const rawContent = await llm.complete(prompt);

		if (!rawContent) return null;

		// LLMが「Next effect: task.plan」のように喋ってしまった場合を考慮し、
		// 登録されているエフェクト名が文字列の中に含まれているか探す
		const found = Object.keys(registry).find((name) => rawContent.includes(name));

		return found ?? null;
	},

	/**
	 * 2. 選ばれたエフェクトを実行する（引数生成 + 実行）
	 */
	async dispatch(effect: any, effectName: string, task: Task): Promise<any> {
		// 引数生成用のプロンプト
		// selectNextEffectに渡した情報に加えて、「スキーマ」を詳細に提示する
		const argPrompt = `
You are using the tool: "${effectName}"
Description: ${effect.description}

### Task Context
Task: ${task.title}
Strategy: ${task.strategy || "N/A"}

### Current Observation
${JSON.stringify(this.lastEffectResult || "No previous action.")}

### Required JSON Schema
${JSON.stringify(effect.inputSchema, null, 2)}

### Instruction
Based on the task and observation, generate the JSON arguments.
Respond with ONLY the JSON object.
        `.trim();

		console.log(`[Brain] Generating arguments for: ${effectName}`);

		// JSON救出ロジック入りの呼び出し
		const { data, error } = await llm.completeAsJson(argPrompt);
		if (error || !data) {
			console.warn(`[Skip] Failed to get valid JSON for ${effectName}`);
			return;
		}

		// 原子的な実行
		const result = await effect.handler(data);

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
