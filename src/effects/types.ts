// すべてのエフェクトで共通のレスポンス形式
export interface EffectResponse<T = any> {
    success: boolean;
    summary: string; // LLMが次の一手を決めるための短い報告
    data?: T;        // プログラムが利用する詳細データ
    error?: string;
}

// エフェクト定義のインターフェース
export interface EffectDefinition<T> {
    name: string;
    description: string;
    inputSchema: object;
    handler: (args: T) => Promise<EffectResponse>;
}

export const effectResult = {
    ok: <T>(summary: string, data?: T): EffectResponse<T> => ({
        success: true,
        summary,
        data,
    }),
    fail: (error: string): EffectResponse => ({
        success: false,
        summary: `Error: ${error}`,
        error,
    }),
};