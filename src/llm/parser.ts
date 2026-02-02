import { parse } from "valibot";
import { type LLMOutput, LLMOutputSchema } from "./schema";

export function parseLLMOutput(raw: string, validTools?: string[]): LLMOutput {
	try {
		const obj = JSON.parse(raw);
		const parsed: LLMOutput = parse(LLMOutputSchema, obj);

		if (validTools && !validTools.includes(parsed.tool)) {
			throw new Error(
				`LLM出力の tool が無効です: ${parsed.tool}. 有効なツール: ${validTools.join(", ")}`,
			);
		}

		return parsed;
	} catch (e) {
		throw new Error(`LLM出力パースエラー: ${String(e)}\nraw: ${raw}`);
	}
}
