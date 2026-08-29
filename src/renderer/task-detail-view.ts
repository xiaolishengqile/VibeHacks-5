import type { ApplicationSnapshot } from "../desktop/application-service.js";
import type { DecisionRisk } from "../work/decision-engine.js";
import { basicWorkNodeDetail, type WorkContingency } from "../work/types.js";

export interface TaskDetailView {
	readonly id: string;
	readonly title: string;
	readonly owner: string;
	readonly status: string;
	readonly scheduledLabel: string;
	readonly latestStartLabel: string;
	readonly workMinutes: number;
	readonly waitMinutes: number;
	readonly dependencies: readonly string[];
	readonly risk: string;
	readonly reason: string;
	readonly summary: string;
	readonly steps: readonly string[];
	readonly deliverables: readonly string[];
	readonly successCriteria: readonly string[];
	readonly suggestions: readonly string[];
	readonly contingencies: readonly WorkContingency[];
}

const statusLabels: Record<ApplicationSnapshot["nodes"][number]["status"], string> = {
	planned: "已规划",
	ready: "可开始",
	running: "执行中",
	waiting: "等待中",
	review: "待验收",
	done: "已完成",
	stopped: "已停止",
	failed: "失败",
};

const riskLabels: Record<DecisionRisk, string> = {
	low: "低风险",
	medium: "中风险",
	high: "高风险",
};

const instantParts = (value: string): { readonly date: string; readonly time: string } => {
	const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
	return match
		? { date: `${Number(match[2])}月${Number(match[3])}日`, time: `${match[4]}:${match[5]}` }
		: { date: "", time: value };
};

const scheduledLabel = (start: string, end: string): string => {
	const startParts = instantParts(start);
	const endParts = instantParts(end);
	if (start === end) return `${startParts.date} ${startParts.time}`.trim();
	if (startParts.date === endParts.date) {
		return `${startParts.date} ${startParts.time}—${endParts.time}`.trim();
	}
	return `${startParts.date} ${startParts.time}—${endParts.date} ${endParts.time}`.trim();
};

export function toTaskDetailView(snapshot: ApplicationSnapshot, nodeId: string): TaskDetailView | null {
	const node = snapshot.nodes.find((item) => item.id === nodeId);
	if (!node) return null;
	const decision = snapshot.decisions.find((item) => item.nodeId === nodeId);
	const detail = node.detail ?? basicWorkNodeDetail(node.title);
	const nodeById = new Map(snapshot.nodes.map((item) => [item.id, item]));
	const start = decision?.scheduledStart ?? node.latestStart ?? "";
	const end = decision?.scheduledEnd ?? start;
	return {
		id: node.id,
		title: node.title,
		owner: node.owner === "self" ? "自己" : node.owner,
		status: statusLabels[node.status],
		scheduledLabel: start ? scheduledLabel(start, end) : "待安排",
		latestStartLabel: decision?.latestStart
			? `${instantParts(decision.latestStart).date} ${instantParts(decision.latestStart).time}`
			: "未设置",
		workMinutes: node.workMinutes,
		waitMinutes: node.waitMinutes,
		dependencies: node.dependencyIds.map((id) => nodeById.get(id)?.title ?? id),
		risk: decision ? riskLabels[decision.risk] : "待评估",
		reason: decision?.reason ?? "旧任务暂无排期说明",
		...detail,
	};
}
