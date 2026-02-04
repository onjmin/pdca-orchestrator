import path from "node:path";

/**
 * 指定されたパスが BASE_DIR 配下にあるかチェックし、フルパスを返す
 */
export function getSafePath(targetPath: string): string {
	const baseDir = process.env.BASE_DIR ? path.resolve(process.env.BASE_DIR) : process.cwd();
	const resolvedPath = path.resolve(baseDir, targetPath);

	// resolvedPath が baseDir で始まっていない場合は不正アクセスとみなす
	const relative = path.relative(baseDir, resolvedPath);
	const isSafe = relative && !relative.startsWith("..") && !path.isAbsolute(relative);

	if (!isSafe && resolvedPath !== baseDir) {
		throw new Error(`Access Denied: Path "${targetPath}" is outside of allowed directory.`);
	}

	return resolvedPath;
}
