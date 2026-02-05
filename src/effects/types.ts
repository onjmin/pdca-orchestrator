export interface EffectField {
	type: "string" | "number" | "boolean";
	description: string;
	isRawData?: true; // STEP 2で隠蔽し、STEP 3で注入するフラグ
}

// 成功時と失敗時を型レベルで分離する
export type EffectResponse<T = void> =
	| { success: true; summary: string; data: T; error?: never }
	| { success: false; summary: string; data?: never; error: string };

export interface EffectDefinition<T, R = void> {
	name: string;
	description: string;
	inputSchema: Record<keyof T, EffectField>;
	handler: (args: T) => Promise<EffectResponse<R>>;
}

export function createEffect<T, R = void>(
	definition: EffectDefinition<T, R>,
): EffectDefinition<T, R> {
	return definition;
}

export const effectResult = {
	// R が void の場合は data を省略可能にするためのオーバーロード
	ok: <R>(summary: string, data: R): EffectResponse<R> => ({
		success: true,
		summary,
		data,
	}),
	// 戻り値データがない(void)場合のヘルパー
	okVoid: (summary: string): EffectResponse<void> => ({
		success: true,
		summary,
		data: undefined,
	}),
	// fail は data を持たず、error を必須にする。
	// R が何であっても代入可能なように EffectResponse<any> ではなく
	// Union 型の構造を利用する
	fail: (error: string): EffectResponse<never> => ({
		success: false,
		summary: `Error: ${error}`,
		error,
	}),
};
