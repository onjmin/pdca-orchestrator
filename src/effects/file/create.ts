import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { truncateForPrompt } from "../../core/utils";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileCreateArgsSchema = z.object({
	path: z.string().describe("Target file path to create."),
	content: z.string().describe("The full content of the file."),
});

export type FileCreateArgs = z.infer<typeof FileCreateArgsSchema>;

/**
 * EFFECT: file.create
 * ファイルの新規作成、または全文上書きを行います。
 */
export const fileCreateEffect = createEffect<FileCreateArgs, void>({
	name: "file.create",
	description:
		"Create a file with the specified content. If the file already exists, it will be completely overwritten. Parent directories are created automatically.",
	inputSchema: {
		path: {
			type: "string",
			description: "Target file path.",
		},
		content: {
			type: "string",
			description: "The complete raw content to be written to the file.",
			isRawData: true,
		},
	},

	handler: async (args: FileCreateArgs): Promise<EffectResponse<void>> => {
		try {
			const { path: filePath, content } = FileCreateArgsSchema.parse(args);
			const safePath = getSafePath(filePath);

			const isNewFile = !fs.existsSync(safePath);
			fs.mkdirSync(path.dirname(safePath), { recursive: true });
			fs.writeFileSync(safePath, content, "utf8");

			// AIを安心させるための情報を収集
			const stats = fs.statSync(safePath);
			const lines = content.split("\n");
			const preview = truncateForPrompt(content, 200);

			// summary に具体的な情報を詰め込み、ObservationとしてAIに認識させる
			const statusLabel = isNewFile ? "CREATED" : "UPDATED (Overwritten)";
			const summary = [
				`Successfully ${statusLabel}: ${filePath}`,
				`Size: ${stats.size} bytes`,
				`Lines: ${lines.length}`,
				`Content Snapshot:`,
				"---",
				preview,
				"---",
			].join("\n");

			return effectResult.okVoid(summary);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Create error: ${errorMessage}`);
		}
	},
});
