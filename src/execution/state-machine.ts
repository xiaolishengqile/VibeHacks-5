import type { ExecutionRun, ExecutionStatus } from "./types.js";

const transitions: Readonly<Record<ExecutionStatus, ReadonlySet<ExecutionStatus>>> = {
	queued: new Set(["planning", "canceled"]),
	planning: new Set(["awaitingApproval", "paused", "failed", "canceled"]),
	awaitingApproval: new Set(["running", "canceled"]),
	running: new Set(["awaitingApproval", "verifying", "paused", "failed", "canceled"]),
	verifying: new Set(["paused", "succeeded", "failed", "canceled"]),
	paused: new Set(["planning", "running", "verifying", "canceled"]),
	succeeded: new Set(),
	failed: new Set(),
	canceled: new Set(),
};

const terminalStatuses = new Set<ExecutionStatus>(["succeeded", "failed", "canceled"]);

export function transitionExecution(
	run: ExecutionRun,
	target: ExecutionStatus,
	at: string,
	error: string | null = null,
): ExecutionRun {
	if (Number.isNaN(Date.parse(at))) throw new Error("执行状态时间无效");
	if (!transitions[run.status].has(target)) {
		throw new Error(`不允许执行状态从 ${run.status} 迁移到 ${target}`);
	}
	return {
		...run,
		status: target,
		updatedAt: at,
		startedAt: target === "running" && run.startedAt === null ? at : run.startedAt,
		completedAt: terminalStatuses.has(target) ? at : run.completedAt,
		error: target === "failed" ? error ?? "执行失败" : run.error,
		version: run.version + 1,
	};
}
