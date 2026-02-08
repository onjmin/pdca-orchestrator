/**
 * 字数制限
 */
export const truncate = (input: string, limit: number) => {
	return input.length > limit ? `${input.substring(0, limit)}... (truncated)` : input;
};
