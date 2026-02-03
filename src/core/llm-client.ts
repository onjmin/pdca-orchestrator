const LM_URL = process.env.LM_STUDIO_API_URL ?? "http://localhost:1234/v1/chat/completions";
const LM_KEY = process.env.LM_STUDIO_API_KEY;

export interface LLMOutput {
	content: string; // 生のテキスト（思考や回答）
	parsed?: any; // JSONとしてパースされたデータ（成功時のみ）
}

export const llm = {
	/**
	 * テキストとして回答を得る（主にEffectの選択用）
	 */
	async complete(prompt: string): Promise<string> {
		const res = await this.ask(prompt);
		return res.content.trim();
	},

	/**
	 * JSONとして回答を得る（主に引数生成用）
	 */
	async completeAsJson(prompt: string): Promise<any> {
		const res = await this.ask(prompt);
		return repairAndParseJSON(res.content);
	},

	/**
	 * 共通のfetch処理
	 */
	async ask(prompt: string): Promise<LLMOutput> {
		const response = await fetch(LM_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(LM_KEY ? { Authorization: `Bearer ${LM_KEY}` } : {}),
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: prompt }],
				temperature: 0,
			}),
		});

		if (!response.ok) throw new Error(`LLM API Error: ${response.statusText}`);

		const json = await response.json();
		const content = json.choices[0].message.content || "";

		return { content };
	},
};

/**
 * LLMが混ぜたノイズからJSONを救出する
 */
function repairAndParseJSON(badJson: string): any {
	try {
		// 1. そのままパース
		return JSON.parse(badJson);
	} catch {
		// 2. ブラケットを探して抽出
		const start = badJson.indexOf("{");
		const end = badJson.lastIndexOf("}");

		if (start !== -1 && end !== -1 && end > start) {
			const candidate = badJson.slice(start, end + 1);
			try {
				return JSON.parse(candidate);
			} catch (e) {
				console.error("[JSON Repair] Found candidate but failed to parse:", candidate);
				throw e;
			}
		}
		throw new Error(`Could not find JSON structure in LLM output: ${badJson}`);
	}
}
