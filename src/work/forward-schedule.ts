import {
	addCalendarMinutes,
	addWorkingMinutes,
	alignToWorkingTime,
	workdayWindowAt,
	workingWindowAt,
} from "./schedule.js";
import type { WorkNode, WorkProfile } from "./types.js";

const minuteMs = 60_000;

export interface ScheduledSegment {
	readonly scheduledStart: string;
	readonly scheduledEnd: string;
}

export interface ScheduledWindow extends ScheduledSegment {
	readonly scheduledSegments: readonly ScheduledSegment[];
}

const laterInstant = (left: string, right: string): string =>
	Date.parse(left) >= Date.parse(right) ? left : right;

const isTerminal = (node: WorkNode): boolean => node.status === "done" || node.status === "stopped";

const isFixed = (node: WorkNode): node is WorkNode & { readonly fixedStart: string } =>
	!isTerminal(node) && node.fixedStart !== undefined;

const waitUntil = (window: ScheduledWindow, waitMinutes: number): string =>
	new Date(Date.parse(window.scheduledEnd) + waitMinutes * minuteMs).toISOString();

const roundedWorkMinutes = (node: WorkNode, profile: WorkProfile): number => {
	const buffered = node.workMinutes
		+ Math.ceil(node.workMinutes * profile.bufferPercent.value / 100);
	return Math.ceil(buffered / 15) * 15;
};

const fixedWindow = (node: WorkNode & { readonly fixedStart: string }): ScheduledWindow => {
	const scheduledEnd = addCalendarMinutes(node.fixedStart, node.workMinutes);
	return {
		scheduledStart: node.fixedStart,
		scheduledEnd,
		scheduledSegments: [{ scheduledStart: node.fixedStart, scheduledEnd }],
	};
};

export function validateFixedSchedule(nodes: readonly WorkNode[], profile: WorkProfile): void {
	const fixedWindows = nodes.filter(isFixed).map((node) => ({ node, window: fixedWindow(node) }));
	for (const { node, window } of fixedWindows) {
		const workday = workdayWindowAt(node.fixedStart, profile);
		if (!workday
			|| Date.parse(window.scheduledStart) < Date.parse(workday.start)
			|| Date.parse(window.scheduledEnd) > Date.parse(workday.end)) {
			throw new Error(`固定事项不在工作时段内：${node.id}`);
		}
	}

	fixedWindows.sort((left, right) =>
		Date.parse(left.window.scheduledStart) - Date.parse(right.window.scheduledStart));
	for (let index = 1; index < fixedWindows.length; index += 1) {
		const previous = fixedWindows[index - 1];
		const current = fixedWindows[index];
		if (previous && current
			&& Date.parse(current.window.scheduledStart) < Date.parse(previous.window.scheduledEnd)) {
			throw new Error(`固定事项冲突：${previous.node.id} 与 ${current.node.id}`);
		}
	}
}

const busySegments = (
	reservations: readonly ScheduledSegment[],
	windowStart: string,
	windowEnd: string,
): readonly ScheduledSegment[] => reservations
	.filter((segment) => Date.parse(segment.scheduledEnd) > Date.parse(windowStart)
		&& Date.parse(segment.scheduledStart) < Date.parse(windowEnd))
	.sort((left, right) => Date.parse(left.scheduledStart) - Date.parse(right.scheduledStart));

const nextWorkdayStart = (windowEnd: string, profile: WorkProfile): string =>
	alignToWorkingTime(windowEnd, profile, windowEnd);

const findContiguousSlot = (
	earliest: string,
	durationMinutes: number,
	profile: WorkProfile,
	reservations: readonly ScheduledSegment[],
): ScheduledSegment => {
	let cursor = alignToWorkingTime(earliest, profile, earliest);
	for (;;) {
		const window = workingWindowAt(cursor, profile);
		if (!window) {
			cursor = alignToWorkingTime(cursor, profile, cursor);
			continue;
		}
		for (const busy of busySegments(reservations, window.start, window.end)) {
			const busyStartMs = Date.parse(busy.scheduledStart);
			const cursorMs = Date.parse(cursor);
			if (busyStartMs - cursorMs >= durationMinutes * minuteMs) {
				return {
					scheduledStart: cursor,
					scheduledEnd: addWorkingMinutes(cursor, durationMinutes, profile),
				};
			}
			if (Date.parse(busy.scheduledEnd) > cursorMs) {
				cursor = alignToWorkingTime(busy.scheduledEnd, profile, busy.scheduledEnd);
			}
		}
		if (Date.parse(window.end) - Date.parse(cursor) >= durationMinutes * minuteMs) {
			return {
				scheduledStart: cursor,
				scheduledEnd: addWorkingMinutes(cursor, durationMinutes, profile),
			};
		}
		cursor = nextWorkdayStart(window.end, profile);
	}
};

const allocateSplitTask = (
	earliest: string,
	durationMinutes: number,
	profile: WorkProfile,
	reservations: readonly ScheduledSegment[],
): readonly ScheduledSegment[] => {
	const segments: ScheduledSegment[] = [];
	let remaining = durationMinutes;
	let cursor = alignToWorkingTime(earliest, profile, earliest);
	while (remaining > 0) {
		const window = workingWindowAt(cursor, profile);
		if (!window) {
			cursor = alignToWorkingTime(cursor, profile, cursor);
			continue;
		}
		for (const busy of busySegments(reservations, window.start, window.end)) {
			const freeMinutes = Math.max(0, Math.floor(
				(Date.parse(busy.scheduledStart) - Date.parse(cursor)) / minuteMs,
			));
			if (freeMinutes > 0) {
				const used = Math.min(freeMinutes, remaining);
				const end = addWorkingMinutes(cursor, used, profile);
				segments.push({ scheduledStart: cursor, scheduledEnd: end });
				remaining -= used;
				if (remaining === 0) return segments;
			}
			if (Date.parse(busy.scheduledEnd) > Date.parse(cursor)) {
				cursor = alignToWorkingTime(busy.scheduledEnd, profile, busy.scheduledEnd);
			}
		}
		const freeMinutes = Math.max(0, Math.floor(
			(Date.parse(window.end) - Date.parse(cursor)) / minuteMs,
		));
		if (freeMinutes > 0) {
			const used = Math.min(freeMinutes, remaining);
			const end = addWorkingMinutes(cursor, used, profile);
			segments.push({ scheduledStart: cursor, scheduledEnd: end });
			remaining -= used;
			if (remaining === 0) return segments;
		}
		cursor = nextWorkdayStart(window.end, profile);
	}
	return segments;
};

const allocateTask = (
	earliest: string,
	durationMinutes: number,
	profile: WorkProfile,
	reservations: readonly ScheduledSegment[],
): readonly ScheduledSegment[] => {
	const aligned = alignToWorkingTime(earliest, profile, earliest);
	const window = workingWindowAt(aligned, profile);
	if (!window) throw new Error("无法读取工作日可用时段");
	const availableMinutes = Math.floor(
		(Date.parse(window.end) - Date.parse(window.start)) / minuteMs,
	);
	return durationMinutes <= availableMinutes
		? [findContiguousSlot(aligned, durationMinutes, profile, reservations)]
		: allocateSplitTask(aligned, durationMinutes, profile, reservations);
};

export function buildForwardSchedule(
	nodes: readonly WorkNode[],
	latestStarts: ReadonlyMap<string, string>,
	profile: WorkProfile,
	now: string,
	referenceInstant: string,
): ReadonlyMap<string, ScheduledWindow> {
	if (!profile.bufferPercent.confirmed) throw new Error("安全缓冲尚未确认");
	validateFixedSchedule(nodes, profile);
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const windows = new Map<string, ScheduledWindow>();
	const reservations: ScheduledSegment[] = [];
	const firstAvailable = alignToWorkingTime(now, profile, referenceInstant);
	for (const node of nodes.filter(isFixed)) {
		const window = fixedWindow(node);
		windows.set(node.id, window);
		reservations.push(...window.scheduledSegments);
	}

	const schedule = (node: WorkNode): ScheduledWindow => {
		const existing = windows.get(node.id);
		if (existing) return existing;
		const preferred = node.latestStart ?? latestStarts.get(node.id) ?? firstAvailable;
		if (isTerminal(node)) {
			const window = { scheduledStart: preferred, scheduledEnd: preferred, scheduledSegments: [] };
			windows.set(node.id, window);
			return window;
		}

		let earliest = firstAvailable;
		for (const dependencyId of node.dependencyIds) {
			const dependency = byId.get(dependencyId);
			if (!dependency) continue;
			const dependencyWindow = schedule(dependency);
			if (!isTerminal(dependency)) {
				earliest = laterInstant(earliest, waitUntil(dependencyWindow, dependency.waitMinutes));
			}
		}

		if (node.workMinutes === 0) {
			const point = node.latestStart ?? alignToWorkingTime(earliest, profile, referenceInstant);
			const window = { scheduledStart: point, scheduledEnd: point, scheduledSegments: [] };
			windows.set(node.id, window);
			return window;
		}

		const scheduledSegments = allocateTask(
			earliest,
			roundedWorkMinutes(node, profile),
			profile,
			reservations,
		);
		reservations.push(...scheduledSegments);
		const first = scheduledSegments[0];
		const last = scheduledSegments[scheduledSegments.length - 1];
		if (!first || !last) throw new Error(`无法安排任务：${node.id}`);
		const window = {
			scheduledStart: first.scheduledStart,
			scheduledEnd: last.scheduledEnd,
			scheduledSegments,
		};
		windows.set(node.id, window);
		return window;
	};

	const ordered = [...nodes].sort((left, right) => {
		const leftAt = Date.parse(latestStarts.get(left.id) ?? referenceInstant);
		const rightAt = Date.parse(latestStarts.get(right.id) ?? referenceInstant);
		return leftAt - rightAt;
	});
	for (const node of ordered) schedule(node);
	return windows;
}
