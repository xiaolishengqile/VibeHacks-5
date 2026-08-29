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
	readonly waitLabel: string | null;
	readonly latestStart: string | null;
}

export interface ExecutionView {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly progress: string;
	readonly updatedAt: string;
}

export type MiniExecutionAction = "start" | "confirm" | "approve" | "deny" | "cancel" | "resume" | "accept";

export interface MiniExecutionControl {
	readonly primaryLabel: string;
	readonly primaryAction: Exclude<MiniExecutionAction, "deny"> | null;
	readonly secondaryAction: "deny" | null;
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
	queued: "等待规划",
	planning: "规划中",
	awaitingApproval: "等待确认",
	running: "执行中",
	verifying: "验证中",
	succeeded: "已完成",
	failed: "失败",
	paused: "已暂停",
	canceled: "已取消",
};

const durationLabel = (minutes: number): string => {
	if (minutes > 0 && minutes % 1440 === 0) return `${minutes / 1440} 天`;
	if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60} 小时`;
	return `${minutes} 分钟`;
};

export const formatHumanInstant = (value: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
	if (!match) return value.slice(0, 16).replace("T", " ");
	return `${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]}`;
};

const readableDecisionReason = (reason: string, latestStart: string): string => {
	if (!/目标为|预计工作|外部等待|安全缓冲|最晚开始/.test(reason)) return reason;
	const waitMinutes = Number(/外部等待\s+(\d+)\s*分钟/.exec(reason)?.[1] ?? 0);
	const workMinutes = Number(/预计工作\s+(\d+)\s*分钟/.exec(reason)?.[1] ?? 0);
	const dependency = /依赖\s+([^；]+)\s+尚未完成/.exec(reason)?.[1];
	const capacity = /所需时间超过每日容量\s+(\d+)\s*分钟/.exec(reason)?.[1];
	const parts = [
		waitMinutes > 0 ? `需要等待 ${durationLabel(waitMinutes)}` : null,
		workMinutes > 0 ? `预计工作 ${workMinutes} 分钟` : null,
		dependency ? `等待 ${dependency} 完成` : null,
		capacity ? `超过每日容量 ${durationLabel(Number(capacity))}` : null,
	].filter((part): part is string => Boolean(part));
	parts.push(`最晚 ${formatHumanInstant(latestStart)} 开始。`);
	return parts.join("；");
};

export function toTodayActionView(decision: WorkDecision | null): TodayActionView | null {
	if (!decision) return null;
	return {
		title: decision.title,
		latestStart: formatHumanInstant(decision.latestStart),
		risk: riskLabels[decision.risk],
		action: actionLabels[decision.recommendedAction],
		reason: readableDecisionReason(decision.reason, decision.latestStart),
	};
}

export function toGraphView(snapshot: ApplicationSnapshot): readonly GraphNodeView[] {
	const decisionByNode = new Map(snapshot.decisions.map((decision) => [decision.nodeId, decision]));
	const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
	return snapshot.nodes.map((node) => ({
		id: node.id,
		title: node.title,
		owner: node.owner === "self" ? "自己" : node.owner,
		status: nodeStatusLabels[node.status],
		dependencies: node.dependencyIds.map((id) => nodeById.get(id)?.title ?? id),
		waitLabel: node.waitMinutes > 0 ? durationLabel(node.waitMinutes) : null,
		latestStart: decisionByNode.get(node.id)?.latestStart || node.latestStart
			? formatHumanInstant(decisionByNode.get(node.id)?.latestStart ?? node.latestStart ?? "")
			: null,
	}));
}

export function toExecutionView(execution: ExecutionSummary): ExecutionView {
	return {
		id: execution.id,
		title: execution.title,
		status: executionStatusLabels[execution.status],
		progress: execution.progress,
		updatedAt: formatHumanInstant(execution.updatedAt),
	};
}

export function toMiniExecutionControl(input: {
	readonly execution: ExecutionSummary | null;
	readonly hasApproval: boolean;
	readonly hasVerifiedArtifact: boolean;
	readonly canStart: boolean;
}): MiniExecutionControl {
	const execution = input.execution;
	if (!execution || execution.status === "failed" || execution.status === "canceled") {
		return {
			primaryLabel: "生成执行计划",
			primaryAction: input.canStart ? "start" : null,
			secondaryAction: null,
		};
	}
	if (execution.status === "queued" || execution.status === "planning") {
		return { primaryLabel: "正在生成计划", primaryAction: null, secondaryAction: null };
	}
	if (execution.status === "awaitingApproval") {
		return input.hasApproval
			? { primaryLabel: "批准一次", primaryAction: "approve", secondaryAction: "deny" }
			: { primaryLabel: "确认并开始", primaryAction: "confirm", secondaryAction: null };
	}
	if (execution.status === "running" || execution.status === "verifying") {
		return { primaryLabel: "取消执行", primaryAction: "cancel", secondaryAction: null };
	}
	if (execution.status === "paused") {
		return { primaryLabel: "恢复执行", primaryAction: "resume", secondaryAction: null };
	}
	if (execution.status === "succeeded" && input.canStart) {
		return { primaryLabel: "生成执行计划", primaryAction: "start", secondaryAction: null };
	}
	return input.hasVerifiedArtifact
		? { primaryLabel: "接受成果", primaryAction: "accept", secondaryAction: null }
		: { primaryLabel: "等待成果验证", primaryAction: null, secondaryAction: null };
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
