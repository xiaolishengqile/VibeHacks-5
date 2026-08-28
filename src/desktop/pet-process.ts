import { spawn } from "node:child_process";
import { join } from "node:path";

import { terminateProcessTree } from "../shared/process-tree.js";

export interface PetConnection {
	readonly port: number;
	readonly token: string;
}

export interface PetLaunchInput extends PetConnection {
	readonly packaged: boolean;
	readonly projectRoot?: string;
	readonly resourcesPath?: string;
}

export interface PetLaunchSpec {
	readonly command: string;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv;
}

interface ChildProcessLike {
	readonly pid?: number | undefined;
	once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
	kill(signal?: NodeJS.Signals): boolean;
}

interface PetProcessOptions {
	readonly packaged: boolean;
	readonly projectRoot?: string;
	readonly resourcesPath?: string;
	readonly spawnProcess?: (spec: PetLaunchSpec) => ChildProcessLike;
	readonly schedule?: (callback: () => void) => unknown;
	readonly now?: () => number;
}

export function petLaunchSpec(input: PetLaunchInput): PetLaunchSpec {
	const projectRoot = input.projectRoot ?? process.cwd();
	const resourcesPath = input.resourcesPath ?? join(projectRoot, "resources");
	return {
		command: input.packaged
			? join(resourcesPath, "pet", "毛球桌宠.app", "Contents", "MacOS", "毛球桌宠")
			: "/Applications/Godot.app/Contents/MacOS/Godot",
		args: input.packaged ? [] : ["--path", projectRoot],
		env: {
			...process.env,
			STARTDAY_BRIDGE_PORT: String(input.port),
			STARTDAY_BRIDGE_TOKEN: input.token,
		},
	};
}

export class PetProcess {
	readonly #options: PetProcessOptions;
	readonly #spawnProcess: (spec: PetLaunchSpec) => ChildProcessLike;
	readonly #schedule: (callback: () => void) => unknown;
	readonly #now: () => number;
	readonly #restartTimes: number[] = [];
	#connection: PetConnection | null = null;
	#child: ChildProcessLike | null = null;
	#deliberateStop = false;

	constructor(options: PetProcessOptions) {
		this.#options = options;
		this.#spawnProcess = options.spawnProcess ?? ((spec) => spawn(spec.command, spec.args, {
			env: spec.env,
			stdio: "ignore",
			detached: process.platform !== "win32",
		}) as ChildProcessLike);
		this.#schedule = options.schedule ?? ((callback) => setTimeout(callback, 800));
		this.#now = options.now ?? Date.now;
	}

	start(connection: PetConnection): void {
		if (this.#child) return;
		this.#connection = connection;
		this.#deliberateStop = false;
		this.#spawn();
	}

	restartAfterCrash(): boolean {
		if (this.#deliberateStop || !this.#connection || this.#child) return false;
		const cutoff = this.#now() - 60_000;
		while ((this.#restartTimes[0] ?? Number.POSITIVE_INFINITY) < cutoff) this.#restartTimes.shift();
		if (this.#restartTimes.length >= 3) return false;
		this.#restartTimes.push(this.#now());
		this.#schedule(() => {
			if (!this.#deliberateStop && !this.#child) this.#spawn();
		});
		return true;
	}

	stop(): void {
		this.#deliberateStop = true;
		const child = this.#child;
		this.#child = null;
		if (child) terminateProcessTree(child, "SIGTERM");
	}

	#spawn(): void {
		if (!this.#connection) return;
		const spec = petLaunchSpec({
			...this.#connection,
			packaged: this.#options.packaged,
			...(this.#options.projectRoot ? { projectRoot: this.#options.projectRoot } : {}),
			...(this.#options.resourcesPath ? { resourcesPath: this.#options.resourcesPath } : {}),
		});
		const child = this.#spawnProcess(spec);
		this.#child = child;
		child.once("exit", () => {
			if (this.#child !== child) return;
			this.#child = null;
			this.restartAfterCrash();
		});
	}
}
