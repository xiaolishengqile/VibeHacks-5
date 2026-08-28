import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ArtifactVerificationRule =
	| { readonly kind: "contains"; readonly text: string }
	| {
		readonly kind: "command";
		readonly executable: string;
		readonly args: readonly string[];
		readonly cwd?: string;
	};

export interface ArtifactVerification {
	readonly path: string;
	readonly sha256: string;
	readonly size: number;
	readonly verified: true;
}

async function canonical(input: string): Promise<string> {
	const absolute = resolve(input);
	try {
		return await realpath(absolute);
	} catch {
		const parent = dirname(absolute);
		if (parent === absolute) return absolute;
		return join(await canonical(parent), basename(absolute));
	}
}

const contained = (root: string, target: string): boolean => {
	const child = relative(root, target);
	return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
};

async function assertContained(target: string, roots: readonly string[]): Promise<string> {
	const canonicalTarget = await canonical(target);
	const canonicalRoots = await Promise.all(roots.map(canonical));
	if (!canonicalRoots.some((root) => contained(root, canonicalTarget))) {
		throw new Error("成果不在用户授权目录内");
	}
	return canonicalTarget;
}

export class ArtifactManager {
	async verify(
		path: string,
		workspaceRoots: readonly string[],
		rules: readonly ArtifactVerificationRule[] = [],
	): Promise<ArtifactVerification> {
		const verifiedPath = await assertContained(path, workspaceRoots);
		let metadata;
		try {
			metadata = await stat(verifiedPath);
		} catch {
			throw new Error(`成果文件不存在：${path}`);
		}
		if (!metadata.isFile()) throw new Error(`成果不是普通文件：${path}`);
		if (metadata.size === 0) throw new Error(`成果是空文件：${path}`);
		const content = await readFile(verifiedPath);
		for (const rule of rules) {
			if (rule.kind === "contains") {
				if (!content.toString("utf8").includes(rule.text)) {
					throw new Error(`成果缺少要求内容：${rule.text}`);
				}
				continue;
			}
			try {
				await execFileAsync(rule.executable, [...rule.args], {
					cwd: rule.cwd ?? dirname(verifiedPath),
					timeout: 60_000,
				});
			} catch {
				throw new Error(`成果检查命令失败：${rule.executable}`);
			}
		}
		return {
			path: verifiedPath,
			sha256: createHash("sha256").update(content).digest("hex"),
			size: metadata.size,
			verified: true,
		};
	}

	async copyVersioned(source: string, requestedTarget: string, workspaceRoots: readonly string[]): Promise<string> {
		const verifiedSource = (await this.verify(source, workspaceRoots)).path;
		await assertContained(requestedTarget, workspaceRoots);
		const extension = extname(requestedTarget);
		const stem = basename(requestedTarget, extension);
		for (let version = 1; version <= 10_000; version += 1) {
			const candidate = version === 1
				? requestedTarget
				: join(dirname(requestedTarget), `${stem} (${version})${extension}`);
			try {
				await copyFile(verifiedSource, candidate, constants.COPYFILE_EXCL);
				return candidate;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		}
		throw new Error("成果版本数量超过上限");
	}
}
