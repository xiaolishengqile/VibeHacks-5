import type { ApplicationSnapshot } from "../desktop/application-service.js";
import { basicWorkNodeDetail, type WorkNode, type WorkNodeDetail } from "../work/types.js";

interface InstantView {
	readonly key: string;
	readonly weekday: string;
	readonly time: string;
}

interface ScheduleEntry {
	readonly node: WorkNode;
	readonly start: InstantView;
	readonly end: InstantView;
}

type ScheduleDecision = ApplicationSnapshot["decisions"][number];

const validTimeZone = (candidate: string | undefined): string => {
	const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	try {
		new Intl.DateTimeFormat("zh-CN", { timeZone: candidate ?? fallback }).format();
		return candidate ?? fallback;
	} catch {
		return fallback;
	}
};

const instantView = (value: string, timeZone: string): InstantView | null => {
	const instant = new Date(value);
	if (Number.isNaN(instant.getTime())) return null;
	const parts = new Map(new Intl.DateTimeFormat("zh-CN", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(instant).map((part) => [part.type, part.value]));
	const year = parts.get("year");
	const month = parts.get("month");
	const day = parts.get("day");
	const hour = parts.get("hour");
	const minute = parts.get("minute");
	if (!year || !month || !day || !hour || !minute) return null;
	return {
		key: `${year}-${month}-${day}`,
		weekday: parts.get("weekday") ?? "工作日",
		time: `${hour}:${minute}`,
	};
};

const detailOf = (node: WorkNode): WorkNodeDetail => node.detail ?? basicWorkNodeDetail(node.title);

const isLater = (current: string, previous: string): boolean => {
	const currentTime = Date.parse(current);
	const previousTime = Date.parse(previous);
	return Number.isFinite(currentTime) && Number.isFinite(previousTime) && currentTime > previousTime;
};

const isDecisionDelayed = (current: ScheduleDecision, previous: ScheduleDecision): boolean => {
	if (isLater(current.scheduledStart, previous.scheduledStart)
		|| isLater(current.scheduledEnd, previous.scheduledEnd)) return true;
	const currentSegments = current.scheduledSegments ?? [];
	const previousSegments = previous.scheduledSegments ?? [];
	return currentSegments.some((segment, index) => {
		const previousSegment = previousSegments[index];
		return previousSegment
			? isLater(segment.scheduledStart, previousSegment.scheduledStart)
				|| isLater(segment.scheduledEnd, previousSegment.scheduledEnd)
			: false;
	});
};

const scheduleEntries = (snapshot: ApplicationSnapshot, timeZone: string): readonly ScheduleEntry[] => {
	const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
	return snapshot.decisions.flatMap((decision) => {
		const node = nodeById.get(decision.nodeId);
		if (!node || node.status === "done" || node.status === "stopped" || node.status === "failed") return [];
		const segments = decision.scheduledSegments?.length
			? decision.scheduledSegments
			: [{ scheduledStart: decision.scheduledStart, scheduledEnd: decision.scheduledEnd }];
		return segments.flatMap((segment) => {
			const start = instantView(segment.scheduledStart, timeZone);
			const end = instantView(segment.scheduledEnd, timeZone);
			return start && end ? [{ node, start, end }] : [];
		});
	}).sort((left, right) => `${left.start.key}${left.start.time}`.localeCompare(`${right.start.key}${right.start.time}`));
};

const period = (time: string): "上午" | "下午" | "晚间（可选）" => {
	const hour = Number(time.slice(0, 2));
	if (hour < 12) return "上午";
	if (hour < 18) return "下午";
	return "晚间（可选）";
};

const entryLines = (
	entry: ScheduleEntry,
	index: number,
	addedNodeIds: ReadonlySet<string>,
	urgentNodeIds: ReadonlySet<string>,
	shiftedNodeIds: ReadonlySet<string>,
): readonly string[] => {
	const detail = detailOf(entry.node);
	const label = urgentNodeIds.has(entry.node.id)
		? "【最高优·紧急插队任务】"
		: addedNodeIds.has(entry.node.id)
			? "【新增任务】"
			: shiftedNodeIds.has(entry.node.id) ? "【顺延补位】" : "";
	const contingency = detail.contingencies[0];
	return [
		`${index + 1}. ${entry.start.time}-${entry.end.time}${label}：${entry.node.title}`,
		`   ${detail.steps.join("；")}。`,
		`   建议：${detail.suggestions.join("；")}。`,
		...(contingency ? [
			`   预案：${contingency.risk}；${contingency.trigger}时，${contingency.action}。`,
		] : []),
	];
};

const rationaleLines = (
	entries: readonly ScheduleEntry[],
	addedNodeIds: ReadonlySet<string>,
	urgentNodeIds: ReadonlySet<string>,
	shiftedNodeIds: ReadonlySet<string>,
	snapshot: ApplicationSnapshot,
): readonly string[] => {
	const decisionByNode = new Map(snapshot.decisions.map((decision) => [decision.nodeId, decision]));
	const added = entries.find((entry) => urgentNodeIds.has(entry.node.id))
		?? entries.find((entry) => addedNodeIds.has(entry.node.id));
	const shifted = entries.find((entry) => shiftedNodeIds.has(entry.node.id));
	const lines = [
		"本次排期排布合理性说明",
		"核心微观排期理由（针对当前真实取舍）",
	];
	let index = 1;
	if (added) {
		const label = urgentNodeIds.has(added.node.id) ? "紧急任务优先" : "新增任务安排";
		lines.push(`${index++}. ${label}：${decisionByNode.get(added.node.id)?.reason ?? "已放入当前可用工作时段"}。`);
	}
	if (shifted) {
		lines.push(`${index++}. 原有任务顺延：${shifted.node.title}移入剩余时段，任务没有丢失，并继续保留原有风险预案。`);
	}
	lines.push(`${index}. 排布总结：按真实可用时段依次执行，优先守住明确截止，同时避免理想化地把多件事堆在同一时段。`);
	return lines;
};

export function toPlanResponseText(
	snapshot: ApplicationSnapshot,
	previous: ApplicationSnapshot | null = null,
	now = new Date().toISOString(),
): string {
	if (!snapshot.goal) return "把要安排的事发给我，我会拆解任务、依赖和时间，并同步到主页。";
	const timeZone = validTimeZone(snapshot.profile?.timezone);
	const entries = scheduleEntries(snapshot, timeZone);
	if (entries.length === 0) return `好的，「${snapshot.goal.title}」当前没有待安排事项。`;
	const hasPreviousPlan = Boolean(previous?.goal);
	const previousNodeIds = new Set(previous?.nodes.map((node) => node.id) ?? []);
	const addedNodes = hasPreviousPlan
		? snapshot.nodes.filter((node) => !previousNodeIds.has(node.id))
		: [];
	const addedNodeIds = new Set(addedNodes.map((node) => node.id));
	const decisionByNodeId = new Map(snapshot.decisions.map((decision) => [decision.nodeId, decision]));
	const urgentNodeIds = new Set(addedNodes
		.filter((node) => {
			const decision = decisionByNodeId.get(node.id);
			if (!decision) return false;
			const target = instantView(decision.targetAt, timeZone);
			const start = instantView(decision.scheduledStart, timeZone);
			return decision.risk === "high" || Boolean(target && start && target.key === start.key);
		})
		.map((node) => node.id));
	const previousDecisionByNodeId = new Map(previous?.decisions.map((decision) => [decision.nodeId, decision]) ?? []);
	const shiftedNodeIds = new Set(snapshot.decisions
		.filter((decision) => {
			const previousDecision = previousDecisionByNodeId.get(decision.nodeId);
			return previousDecision ? isDecisionDelayed(decision, previousDecision) : false;
		})
		.map((decision) => decision.nodeId));
	const revised = addedNodeIds.size > 0;
	const urgent = urgentNodeIds.size > 0;
	const shifted = shiftedNodeIds.size > 0;
	const urgentLabel = addedNodes.filter((node) => urgentNodeIds.has(node.id)).map((node) => node.title).join("、");
	const regularAddedLabel = addedNodes.filter((node) => !urgentNodeIds.has(node.id)).map((node) => node.title).join("、");
	const addedLabel = addedNodes.map((node) => node.title).join("、");
	const firstDay = (revised
		? entries.find((entry) => urgentNodeIds.has(entry.node.id))?.start.key
			?? entries.find((entry) => addedNodeIds.has(entry.node.id))?.start.key
		: undefined) ?? entries[0]!.start.key;
	const dayEntries = entries.filter((entry) => entry.start.key === firstDay);
	const currentDay = instantView(now, timeZone)?.key;
	const lines = [
		revised
			? urgent
				? `好的，已把“${urgentLabel}”作为紧急任务插入${regularAddedLabel ? `，同时加入“${regularAddedLabel}”` : ""}${shifted ? "，原有事项按剩余时段顺延补位" : ""}。`
				: `好的，已加入“${addedLabel}”并重新安排。`
			: `好的，我已经根据截止时间、审核和协作等待，把“${snapshot.goal.title}”拆成可执行排期。`,
		"",
		`${dayEntries[0]!.start.weekday}（${revised
			? urgent
				? `紧急临时任务插队${shifted ? " + 原有任务顺延补位" : ""}`
				: shifted ? "新增任务插入 + 原有任务顺延" : "新增任务安排"
			: firstDay === currentDay ? "今日重点安排" : "首个工作日重点安排"}）`,
	];
	let currentPeriod = "";
	for (const [index, entry] of dayEntries.entries()) {
		const nextPeriod = period(entry.start.time);
		if (nextPeriod !== currentPeriod) {
			lines.push("", nextPeriod);
			currentPeriod = nextPeriod;
		}
		lines.push(...entryLines(entry, index, addedNodeIds, urgentNodeIds, shiftedNodeIds));
	}
	if (revised) {
		lines.push("", urgent
			? `无虚假多线程并行，单时段聚焦核心事项；紧急任务优先${shifted ? "，原有工作顺延补位" : ""}，不强行叠加。`
			: "各事项按单时段依次执行，新任务进入可用空档，不叠加占用。", "");
		lines.push(...rationaleLines(entries, addedNodeIds, urgentNodeIds, shiftedNodeIds, snapshot));
	}
	if (entries.some((entry) => entry.start.key !== firstDay)) {
		const remainingLabel = revised
			? "其余工作日"
			: `${entries.find((entry) => entry.start.key !== firstDay)?.start.weekday ?? "后续"}到后续工作日`;
		lines.push("", `${remainingLabel}安排已经放入主页中；如果今天有变动，直接告诉我，我会重新识别协作方、审核节点和卡点风险。`);
	}
	return lines.join("\n");
}
