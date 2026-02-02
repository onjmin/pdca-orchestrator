import { mcpRegistry } from "../mcp/registry";
import type { ToolCall } from "../mcp/schema";
import type { PDCAContext } from "../orchestrator/types";
import { ChatCompletionResponseSchema } from "./schema";

const LLM_URL = process.env.LLM_STUDIO_API_URL ?? "http://localhost:1234/v1/chat/completions";
const LLM_KEY = process.env.LLM_STUDIO_API_KEY;

/**
 * レジストリから全ツールを取得し、OpenAI互換の形式に変換する
 */
async function getMcpTools() {
	const tools = await mcpRegistry.getAllToolsForLLM();
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema, // MCPのinputSchemaはJSON Schema準拠
		},
	}));
}

/**
 * オーケストレーターからの指示を受け、LLMに推論を依頼する
 */
export async function callLLM(context: PDCAContext, systemPrompt: string) {
	// ツール一覧を非同期で取得
	const tools = await getMcpTools();

	const messages = [
		{ role: "system", content: systemPrompt },
		// Actモードで圧縮された「過去の知恵」を提示
		{ role: "assistant", content: `これまでの進捗要約: ${context.summary || "なし"}` },
		// 現在のモード内のやり取り（生ログ）をメッセージ履歴に変換
		...context.history.map((item) => ({
			role: item.role === "thought" ? "assistant" : "user",
			content: item.content,
		})),
		// 最後に本来のタスクをリマインド
		{ role: "user", content: `現在のタスク: ${context.task.prompt}` },
	];

	const res = await fetch(LLM_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(LLM_KEY ? { Authorization: `Bearer ${LLM_KEY}` } : {}),
		},
		body: JSON.stringify({
			model: "local-model", // LM Studio側でロードされているモデル
			messages,
			temperature: 0.7,
			// ツール定義（MCPから取得したスキーマ）をここに渡す
			...(tools.length > 0 ? { tools } : {}),
			tool_choice: tools.length > 0 ? "auto" : undefined,
		}),
	});

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`LLM API Error: ${res.status} - ${errorText}`);
	}

	const rawData = await res.json();

	// 1. APIレスポンス自体の構造を Zod で検証
	const validatedRes = ChatCompletionResponseSchema.parse(rawData);
	const choice = validatedRes.choices[0].message;

	// 2. tool_calls のパース (JSON文字列 -> オブジェクト)
	const toolCalls: ToolCall[] = (choice.tool_calls || [])
		.map((tc) => {
			try {
				// ここで提示されたロジックを応用したパースを実行
				const args = repairAndParseJSON(tc.function.arguments);
				return {
					id: tc.id,
					name: tc.function.name,
					arguments: args,
				};
			} catch {
				console.error(
					`[Parse Error] Tool ${tc.function.name} has invalid JSON:`,
					tc.function.arguments,
				);
				return null;
			}
		})
		.filter((tc): tc is ToolCall => tc !== null);

	// 3. 最終的な LLMOutput 型に整形して返す
	return {
		thought: choice.content || "",
		toolCalls: toolCalls,
	};
}

/**
 * LLMが余計な解説を混ぜたり、閉じ忘れたりしたJSONを救出する
 */
function repairAndParseJSON(badJson: string): any {
	try {
		// 1. そのままパースできれば最高
		return JSON.parse(badJson);
	} catch {
		// 2. ブラケットの範囲を抽出して再試行
		const start = badJson.indexOf("{");
		const end = badJson.lastIndexOf("}");

		if (start !== -1 && end !== -1 && end > start) {
			const candidate = badJson.slice(start, end + 1);
			try {
				return JSON.parse(candidate);
			} catch {
				// 3. 最後の手段: 閉じカッコ不足などの簡易補完（必要に応じて）
				console.warn("JSON repair failed, but found structure:", candidate);
			}
		}
		throw new Error("Could not parse JSON from LLM output");
	}
}
