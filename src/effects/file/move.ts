import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileMoveArgsSchema = z.object({
	from: z.string().describe("Source file path."),
	to: z.string().describe("Destination file path."),
});

export type FileMoveArgs = z.infer<typeof FileMoveArgsSchema>;

/**
 * EFFECT: file.move
 * ファイルやディレクトリの移動。戻り値データは不要なため EffectResponse<void>。
 */
export const move = createEffect<FileMoveArgs, void>({
	name: "file.move",
	description:
		"Move or rename a file/directory. Automatically creates destination directories if needed.",
	inputSchema: {
		type: "object",
		properties: {
			from: { type: "string", description: "Source path." },
			to: { type: "string", description: "Destination path." },
		},
		required: ["from", "to"],
	},

	handler: async (args: FileMoveArgs): Promise<EffectResponse<void>> => {
		try {
			const { from, to } = FileMoveArgsSchema.parse(args);

			const safeFrom = getSafePath(from);
			const safeTo = getSafePath(to);

			if (!fs.existsSync(safeFrom)) {
				// fail は never を返すため、EffectResponse<void> に自動適合
				return effectResult.fail(`Source path not found: ${from}`);
			}

			// 移動先の親ディレクトリを自動作成
			fs.mkdirSync(path.dirname(safeTo), { recursive: true });

			// 移動実行
			fs.renameSync(safeFrom, safeTo);

			// 成功時: okVoid により data: undefined を強制
			return effectResult.okVoid(`Successfully moved/renamed: ${from} -> ${to}`);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Move error: ${errorMessage}`);
		}
	},
});
