/**
 * LLMの入力制限に合わせてテキストを切り詰め、
 * 省略されたことを示すフラグを付与する
 */
export const truncateForPrompt = (input: string, limit: number) => {
	return input.length > limit ? `${input.substring(0, limit)}... (truncated)` : input;
};
