import type {
	ApplicationSnapshot,
	ExecutionSummary,
} from "../desktop/application-service.js";
import type { WorkDecision } from "../work/decision-engine.js";

export type PetStatus = "idle" | "urgent" | "thinking" | "awaiting_approval" | "executing" | "completed" | "failed";

export interface TodayActionView {
	readonly title: string;
	readonly latestStart: string;
	readonly risk: string;
	readonly action: string;
	readonly reason: string;
}

export interface GraphNodeView {
	readonly id: string;
	readonly title: string;
	readonly owner: string;
	readonly status: string;
	readonly dependencies: readonly string[];
	readonly latestStart: string | null;
}

export interface ExecutionView {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly progress: string;
	readonly updatedAt: string;
}

const riskLabels: Record<WorkDecision["risk"], string> = {
	low: "低风险",
	medium: "中风险",
	high: "高风险",
};

const actionLabels: Record<WorkDecision["recommendedAction"], string> = {
	start: "现在开始",
	continue: "继续推进",
	wait: "等待依赖",
	stop: "停止处理",
	later: "稍后处理",
};

const nodeStatusLabels: Record<ApplicationSnapshot["nodes"][number]["status"], string> = {
	planned: "已规划",
	ready: "可开始",
	running: "执行中",
	waiting: "等待中",
	review: "待验收",
	done: "已完成",
	stopped: "已停止",
	failed: "失败",
};

const executionStatusLabels: Record<ExecutionSummary["status"], string> = {
	planning: "规划中",
	awaitingApproval: "等待确认",
	running: "执行中",
	verifying: "验证中",
	succeeded: "已完成",
	failed: "失败",
	paused: "已暂停",
};

const compactInstant = (value: string): string => value.slice(0, 16).replace("T", " ");

export function toTodayActionView(decision: WorkDecision | null): TodayActionView | null {
	if (!decision) return null;
	return {
		title: decision.title,
		latestStart: compactInstant(decision.latestStart),
		risk: riskLabels[decision.risk],
		action: actionLabels[decision.recommendedAction],
		reason: decision.reason,
	};
}

export function toGraphView(snapshot: ApplicationSnapshot): readonly GraphNodeView[] {
	const decisionByNode = new Map(snapshot.decisions.map((decision) => [decision.nodeId, decision]));
	return snapshot.nodes.map((node) => ({
		id: node.id,
		title: node.title,
		owner: node.owner === "self" ? "自己" : node.owner,
		status: nodeStatusLabels[node.status],
		dependencies: node.dependencyIds,
		latestStart: decisionByNode.get(node.id)?.latestStart ?? node.latestStart ?? null,
	}));
}

export function toExecutionView(execution: ExecutionSummary): ExecutionView {
	return {
		id: execution.id,
		title: execution.title,
		status: executionStatusLabels[execution.status],
		progress: execution.progress,
		updatedAt: compactInstant(execution.updatedAt),
	};
}

export function toPetStatus(input: {
	readonly topDecision: WorkDecision | null;
	readonly activeExecution: ExecutionSummary | null;
	readonly now?: string;
}): PetStatus {
	const execution = input.activeExecution;
	if (execution?.status === "awaitingApproval") return "awaiting_approval";
	if (execution?.status === "failed") return "failed";
	if (execution?.status === "running" || execution?.status === "verifying") return "executing";
	if (execution?.status === "planning") return "thinking";
	if (execution?.status === "succeeded") {
		const now = Date.parse(input.now ?? new Date().toISOString());
		const completedAt = Date.parse(execution.updatedAt);
		if (!Number.isNaN(now) && !Number.isNaN(completedAt) && now - completedAt <= 10_000) return "completed";
	}
	if (
		input.topDecision?.risk === "high"
		&& (input.topDecision.recommendedAction === "start" || input.topDecision.recommendedAction === "continue")
	) return "urgent";
	return "idle";
}
