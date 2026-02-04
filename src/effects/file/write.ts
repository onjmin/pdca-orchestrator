import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileWriteArgsSchema = z.object({
	path: z.string().describe("Target file path."),
	raw_content_placeholder: z.string().describe("MANDATORY: Write ONLY '__DATA__' here."),
});

export type FileWriteArgs = z.infer<typeof FileWriteArgsSchema>;

/**
 * EFFECT: file.write
 * ファイルの書き込み。データ返却は不要なため EffectResponse<void> を指定。
 */
export const write = createEffect<FileWriteArgs, void>({
	name: "file.write",
	description: "Write raw text or code to a file.",
	inputSchema: {
		type: "object",
		properties: {
			path: { type: "string", description: "Target file path." },
			raw_content_placeholder: { type: "string", description: "Write ONLY '__DATA__' here." },
		},
		required: ["path", "raw_content_placeholder"],
	},

	handler: async (args: FileWriteArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: filePath, raw_content_placeholder } = FileWriteArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			// 書き込み前に存在確認
			const isNewFile = !fs.existsSync(safePath);

			fs.mkdirSync(path.dirname(safePath), { recursive: true });
			fs.writeFileSync(safePath, raw_content_placeholder, "utf8");

			// 成功時: okVoid で data: undefined を保証
			return effectResult.okVoid(
				isNewFile
					? `Successfully created a new file at: ${filePath}`
					: `Successfully updated the existing file at: ${filePath}`,
			);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			// 失敗時: fail() により EffectResponse<never> が返り、型安全に適合
			return effectResult.fail(`Write error: ${errorMessage}`);
		}
	},
});
