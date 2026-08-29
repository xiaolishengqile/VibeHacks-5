import type { ApplicationSnapshot } from "../desktop/application-service.js";
import type { DecisionRisk } from "../work/decision-engine.js";
import { basicWorkNodeDetail, type WorkContingency } from "../work/types.js";

export interface TaskDetailView {
	readonly id: string;
	readonly title: string;
	readonly owner: string;
	readonly status: string;
	readonly scheduleTypeLabel: "固定时间" | "智能安排";
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

const timeZoneFor = (snapshot: ApplicationSnapshot): string => {
	const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const candidate = snapshot.profile?.timezone ?? fallback;
	try {
		new Intl.DateTimeFormat("en", { timeZone: candidate }).format();
		return candidate;
	} catch {
		return fallback;
	}
};

const instantParts = (value: string, timeZone: string): { readonly date: string; readonly time: string } | null => {
	const instant = new Date(value);
	if (Number.isNaN(instant.getTime())) return null;
	const parts = new Map(new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(instant).map((part) => [part.type, part.value]));
	return {
		date: `${Number(parts.get("month"))}月${Number(parts.get("day"))}日`,
		time: `${parts.get("hour")}:${parts.get("minute")}`,
	};
};

const scheduledLabel = (start: string, end: string, timeZone: string): string | null => {
	const startParts = instantParts(start, timeZone);
	const endParts = instantParts(end, timeZone);
	if (!startParts || !endParts) return null;
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
	const timeZone = timeZoneFor(snapshot);
	const schedule = decision?.scheduledSegments?.length
		? decision.scheduledSegments
			.map((segment) => scheduledLabel(segment.scheduledStart, segment.scheduledEnd, timeZone))
			.filter((label): label is string => label !== null)
			.join("、")
		: start ? scheduledLabel(start, end, timeZone) : null;
	return {
		id: node.id,
		title: node.title,
		owner: node.owner === "self" ? "自己" : node.owner,
		status: statusLabels[node.status],
		scheduleTypeLabel: node.fixedStart ? "固定时间" : "智能安排",
		scheduledLabel: schedule || "待安排",
		latestStartLabel: (() => {
			const latestStart = decision?.latestStart ? instantParts(decision.latestStart, timeZone) : null;
			return latestStart ? `${latestStart.date} ${latestStart.time}` : "未设置";
		})(),
		workMinutes: node.workMinutes,
		waitMinutes: node.waitMinutes,
		dependencies: node.dependencyIds.map((id) => nodeById.get(id)?.title ?? id),
		risk: decision ? riskLabels[decision.risk] : "待评估",
		reason: decision?.reason ?? "旧任务暂无排期说明",
		...detail,
	};
}
