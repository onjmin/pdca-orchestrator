import path from "node:path";

/**
 * 指定されたパスが BASE_DIR 配下にあるか厳格にチェックし、フルパスを返す
 */
export function getSafePath(targetPath: string): string {
	const rawBaseDir = process.env.BASE_DIR;

	// 環境変数が未設定の場合は、事故防止のため実行を拒否する
	if (!rawBaseDir) {
		throw new Error(
			"Security Error: BASE_DIR is not defined in .env. Please specify a dedicated workspace directory.",
		);
	}

	const baseDir = path.resolve(rawBaseDir);
	const resolvedPath = path.resolve(baseDir, targetPath);

	// resolvedPath が baseDir 配下にあるかチェック
	const relative = path.relative(baseDir, resolvedPath);
	const isSafe = !relative.startsWith("..") && !path.isAbsolute(relative);

	// baseDirそのもの、または配下であればOK
	if (!isSafe && resolvedPath !== baseDir) {
		throw new Error(
			`Access Denied: Path "${targetPath}" is outside of allowed directory (${baseDir}).`,
		);
	}

	return resolvedPath;
}
