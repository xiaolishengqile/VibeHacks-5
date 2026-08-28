import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LocatedCodex {
	readonly command: string;
	readonly version: string;
	readonly source: "configured" | "local" | "path";
}

export interface CodexLocatorOptions {
	readonly env?: NodeJS.ProcessEnv;
	readonly localBinaryPath?: string;
}

async function verify(candidate: string, env: NodeJS.ProcessEnv): Promise<string | null> {
	try {
		await access(candidate);
		const { stdout } = await execFileAsync(candidate, ["--version"], {
			env,
			timeout: 5_000,
		});
		const version = stdout.trim();
		return /^codex-cli\s+\d+\.\d+\.\d+/.test(version) ? version : null;
	} catch {
		return null;
	}
}

function pathCandidates(pathValue: string | undefined): string[] {
	if (!pathValue) return [];
	const names = process.platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"];
	return pathValue
		.split(path.delimiter)
		.filter(Boolean)
		.flatMap((directory) => names.map((name) => path.join(directory, name)));
}

export async function locateCodex(options: CodexLocatorOptions = {}): Promise<LocatedCodex | null> {
	const env = options.env ?? process.env;
	const localBinaryPath = options.localBinaryPath
		?? path.resolve("node_modules", ".bin", process.platform === "win32" ? "codex.cmd" : "codex");
	const candidates: Array<{ command: string; source: LocatedCodex["source"] }> = [];
	if (env.STARTDAY_CODEX_PATH) candidates.push({ command: env.STARTDAY_CODEX_PATH, source: "configured" });
	candidates.push({ command: localBinaryPath, source: "local" });
	for (const command of pathCandidates(env.PATH)) candidates.push({ command, source: "path" });

	const visited = new Set<string>();
	for (const candidate of candidates) {
		if (visited.has(candidate.command)) continue;
		visited.add(candidate.command);
		const version = await verify(candidate.command, env);
		if (version) return { ...candidate, version };
	}
	return null;
}
