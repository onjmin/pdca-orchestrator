import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";
import { getSafePath } from "./utils";

export const FileSearchArgsSchema = z.object({
	pattern: z
		.string()
		.describe("The filename or partial pattern to search for (e.g., 'user.service.ts')."),
	root: z.string().default(".").describe("The directory to start the search from."),
});

export type FileSearchArgs = z.infer<typeof FileSearchArgsSchema>;

export interface FileSearchData {
	results: string[];
}

/**
 * EFFECT: file.search
 * ファイル名でプロジェクト内を高速に検索する。
 */
export const search = createEffect<FileSearchArgs, FileSearchData>({
	name: "file.search",
	description:
		"Find files by name pattern within the project. Useful when you know the filename but not the exact path.",
	inputSchema: {
		type: "object",
		properties: {
			pattern: { type: "string" },
			root: { type: "string", default: "." },
		},
		required: ["pattern"],
	},

	handler: async (args: FileSearchArgs): Promise<EffectResponse<FileSearchData>> => {
		try {
			const { pattern, root } = FileSearchArgsSchema.parse(args);
			const safeRoot = getSafePath(root);
			const results: string[] = [];

			const walk = (dir: string) => {
				const files = fs.readdirSync(dir, { withFileTypes: true });
				for (const file of files) {
					const fullPath = path.join(dir, file.name);
					const relativePath = path.relative(safeRoot, fullPath);

					// node_modules等を除外
					if (file.isDirectory()) {
						if (![".git", "node_modules", "dist"].includes(file.name)) {
							walk(fullPath);
						}
					} else if (file.name.toLowerCase().includes(pattern.toLowerCase())) {
						results.push(relativePath);
					}
				}
			};

			walk(safeRoot);

			return effectResult.ok(`Found ${results.length} file(s) matching "${pattern}".`, { results });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Search failed: ${errorMessage}`);
		}
	},
});
