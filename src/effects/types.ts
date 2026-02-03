// すべての Effect が返す共通のレスポンス形式
export interface EffectResponse<T = any> {
    success: boolean;
    summary: string;
    data?: T;
    error?: string;
}

// Effect の定義。T は入力引数の型
export interface EffectDefinition<T> {
    name: string;
    description: string;
    inputSchema: object;
    handler: (args: T) => Promise<EffectResponse>;
}

export const effectResult = {
    // 成功時のレスポンス生成
    ok: <T>(summary: string, data?: T): EffectResponse<T> => ({
        success: true,
        summary,
        data,
    }),
    // 失敗時のレスポンス生成
    fail: (error: string): EffectResponse => ({
        success: false,
        summary: `Error: ${error}`,
        error,
    }),
};