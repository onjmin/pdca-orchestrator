const LLM_URL = process.env.LLM_STUDIO_API_URL ?? "";
const LLM_KEY = process.env.LLM_STUDIO_API_KEY;

if (!LLM_URL) throw new Error("LLM_STUDIO_API_URL が未設定です");

const headers: Record<string, string> = { "Content-Type": "application/json" };
if (LLM_KEY) headers.Authorization = `Bearer ${LLM_KEY}`;

export async function askLLM(prompt: string, model?: string): Promise<string> {
	const res = await fetch(LLM_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({ model: model ?? "default", prompt, max_tokens: 1024 }),
	});

	if (!res.ok) throw new Error(`LLM Studio API error: ${res.status} ${res.statusText}`);

	const data = await res.json();
	return data.text; // 仮想的に返却文字列
}
