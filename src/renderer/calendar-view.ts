import type { ApplicationSnapshot } from "../desktop/application-service.js";

export type CalendarTone = "planned" | "active" | "waiting" | "urgent" | "completed" | "failed";

export interface CalendarItemView {
	readonly id: string;
	readonly title: string;
	readonly dateTime: string;
	readonly timeLabel: string;
	readonly owner: string;
	readonly status: string;
	readonly tone: CalendarTone;
}

export interface CalendarDayView {
	readonly key: string;
	readonly weekday: string;
	readonly dateLabel: string;
	readonly isToday: boolean;
	readonly items: readonly CalendarItemView[];
}

export interface WeekCalendarView {
	readonly rangeLabel: string;
	readonly focusDayKey: string;
	readonly focusItemId: string | null;
	readonly outsideWeekCount: number;
	readonly days: readonly CalendarDayView[];
}

interface CalendarDate {
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

interface ZonedInstant extends CalendarDate {
	readonly hour: number;
	readonly minute: number;
}

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

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

const systemTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const calendarTimeZone = (snapshot: ApplicationSnapshot): string => {
	const fallback = systemTimeZone();
	const candidate = snapshot.profile?.timezone ?? fallback;
	try {
		new Intl.DateTimeFormat("en", { timeZone: candidate }).format();
		return candidate;
	} catch {
		return fallback;
	}
};

const zonedInstant = (
	value: string | Date,
	formatter: Intl.DateTimeFormat,
): ZonedInstant | null => {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	const number = (key: Intl.DateTimeFormatPartTypes): number => Number(parts.get(key));
	return {
		year: number("year"),
		month: number("month"),
		day: number("day"),
		hour: number("hour"),
		minute: number("minute"),
	};
};

const dateKey = (date: CalendarDate): string => [
	date.year,
	String(date.month).padStart(2, "0"),
	String(date.day).padStart(2, "0"),
].join("-");

const asUtcDate = (date: CalendarDate): Date => new Date(Date.UTC(date.year, date.month - 1, date.day));

const fromUtcDate = (date: Date): CalendarDate => ({
	year: date.getUTCFullYear(),
	month: date.getUTCMonth() + 1,
	day: date.getUTCDate(),
});

const startOfWeek = (date: CalendarDate): CalendarDate => {
	const utc = asUtcDate(date);
	utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
	return fromUtcDate(utc);
};

const addDays = (date: CalendarDate, days: number): CalendarDate => {
	const utc = asUtcDate(date);
	utc.setUTCDate(utc.getUTCDate() + days);
	return fromUtcDate(utc);
};

const dateLabel = (date: CalendarDate): string => `${date.month}月${date.day}日`;
const weekdayLabel = (date: CalendarDate): string => weekdays[(asUtcDate(date).getUTCDay() + 6) % 7] ?? "";
const timeLabel = (date: ZonedInstant): string =>
	`${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;

const rangeLabel = (start: CalendarDate, end: CalendarDate): string => start.year === end.year
	? `${dateLabel(start)}—${dateLabel(end)}`
	: `${start.year}年${dateLabel(start)}—${end.year}年${dateLabel(end)}`;

export const weekOffsetDeltaFromSwipe = (
	startX: number,
	endX: number,
	threshold = 48,
): -1 | 0 | 1 => {
	const distance = startX - endX;
	if (Math.abs(distance) < threshold) return 0;
	return distance > 0 ? 1 : -1;
};

const toneFor = (
	status: ApplicationSnapshot["nodes"][number]["status"],
	risk: ApplicationSnapshot["decisions"][number]["risk"] | undefined,
): CalendarTone => {
	if (status === "done") return "completed";
	if (status === "failed" || status === "stopped") return "failed";
	if (status === "running" || status === "review") return "active";
	if (status === "waiting") return "waiting";
	if (risk === "high") return "urgent";
	return "planned";
};

export function toCalendarWindowView(
	snapshot: ApplicationSnapshot,
	now = new Date().toISOString(),
	dayOffset = 0,
	spanDays = 7,
): WeekCalendarView {
	const timeZone = calendarTimeZone(snapshot);
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	const current = zonedInstant(now, formatter) ?? zonedInstant(new Date(), formatter);
	if (!current) throw new Error("无法读取当前日历日期");
	const firstDecision = snapshot.decisions[0];
	const firstDecisionDate = firstDecision ? zonedInstant(firstDecision.latestStart, formatter) : null;
	const anchor = firstDecisionDate ?? current;
	const windowStart = addDays(startOfWeek(anchor), dayOffset);
	const windowDates = Array.from({ length: Math.max(1, spanDays) }, (_, index) => addDays(windowStart, index));
	const windowKeys = new Set(windowDates.map(dateKey));
	const todayKey = dateKey(current);
	const decisionByNode = new Map(snapshot.decisions.map((decision) => [decision.nodeId, decision]));
	const itemsByDay = new Map<string, CalendarItemView[]>();
	let outsideWindowCount = 0;

	for (const node of snapshot.nodes) {
		const decision = decisionByNode.get(node.id);
		const dateTime = decision?.latestStart ?? node.latestStart ?? "";
		const date = zonedInstant(dateTime, formatter);
		if (!date) continue;
		const key = dateKey(date);
		if (!windowKeys.has(key)) {
			outsideWindowCount += 1;
			continue;
		}
		const items = itemsByDay.get(key) ?? [];
		items.push({
			id: node.id,
			title: node.title,
			dateTime,
			timeLabel: timeLabel(date),
			owner: node.owner === "self" ? "自己" : node.owner,
			status: statusLabels[node.status],
			tone: toneFor(node.status, decision?.risk),
		});
		itemsByDay.set(key, items);
	}

	const days = windowDates.map((date): CalendarDayView => {
		const key = dateKey(date);
		return {
			key,
			weekday: weekdayLabel(date),
			dateLabel: dateLabel(date),
			isToday: key === todayKey,
			items: (itemsByDay.get(key) ?? []).sort((left, right) => left.timeLabel.localeCompare(right.timeLabel)),
		};
	});
	const windowEnd = windowDates[windowDates.length - 1] ?? windowStart;
	const focusDayKey = dayOffset === 0
		? dateKey(anchor)
		: [...itemsByDay.keys()].sort()[0] ?? dateKey(windowStart);
	const focusItemId = dayOffset === 0
		? firstDecision?.nodeId ?? null
		: itemsByDay.get(focusDayKey)?.[0]?.id ?? null;

	return {
		rangeLabel: rangeLabel(windowStart, windowEnd),
		focusDayKey,
		focusItemId,
		outsideWeekCount: outsideWindowCount,
		days,
	};
}

export function toWeekCalendarView(
	snapshot: ApplicationSnapshot,
	now = new Date().toISOString(),
	weekOffset = 0,
): WeekCalendarView {
	return toCalendarWindowView(snapshot, now, weekOffset * 7);
}
