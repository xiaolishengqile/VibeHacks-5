export interface KillableProcess {
	readonly pid?: number | undefined;
	kill(signal?: NodeJS.Signals): boolean;
}

export function terminateProcessTree(child: KillableProcess, signal: NodeJS.Signals): boolean {
	if (process.platform !== "win32" && child.pid && child.pid > 0) {
		try {
			process.kill(-child.pid, signal);
			return true;
		} catch {
			// 进程组可能已经结束，继续尝试终止主进程。
		}
	}
	try {
		return child.kill(signal);
	} catch {
		return false;
	}
}
