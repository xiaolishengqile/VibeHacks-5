import { addWorkingMinutes, alignToWorkingTime } from "./schedule.js";
import type { WorkNode, WorkProfile } from "./types.js";

const minuteMs = 60_000;

export interface ScheduledWindow {
	readonly scheduledStart: string;
	readonly scheduledEnd: string;
}

const laterInstant = (left: string, right: string): string =>
	Date.parse(left) >= Date.parse(right) ? left : right;

const waitUntil = (window: ScheduledWindow, waitMinutes: number): string =>
	new Date(Date.parse(window.scheduledEnd) + waitMinutes * minuteMs).toISOString();

const roundedWorkMinutes = (node: WorkNode, profile: WorkProfile): number => {
	const buffered = node.workMinutes
		+ Math.ceil(node.workMinutes * profile.bufferPercent.value / 100);
	return Math.ceil(buffered / 15) * 15;
};

export function buildForwardSchedule(
	nodes: readonly WorkNode[],
	latestStarts: ReadonlyMap<string, string>,
	profile: WorkProfile,
	now: string,
	referenceInstant: string,
): ReadonlyMap<string, ScheduledWindow> {
	if (!profile.bufferPercent.confirmed) throw new Error("安全缓冲尚未确认");
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const windows = new Map<string, ScheduledWindow>();
	let cursor = alignToWorkingTime(now, profile, referenceInstant);

	const schedule = (node: WorkNode): ScheduledWindow => {
		const existing = windows.get(node.id);
		if (existing) return existing;
		const preferred = node.latestStart ?? latestStarts.get(node.id) ?? cursor;
		if (node.status === "done" || node.status === "stopped") {
			const window = { scheduledStart: preferred, scheduledEnd: preferred };
			windows.set(node.id, window);
			return window;
		}

		let earliest = cursor;
		for (const dependencyId of node.dependencyIds) {
			const dependency = byId.get(dependencyId);
			if (!dependency) continue;
			const dependencyWindow = schedule(dependency);
			earliest = laterInstant(earliest, waitUntil(dependencyWindow, dependency.waitMinutes));
		}

		if (node.workMinutes === 0 && node.latestStart) {
			const window = { scheduledStart: node.latestStart, scheduledEnd: node.latestStart };
			windows.set(node.id, window);
			return window;
		}

		const scheduledStart = alignToWorkingTime(earliest, profile, referenceInstant);
		const scheduledEnd = node.workMinutes === 0
			? scheduledStart
			: addWorkingMinutes(scheduledStart, roundedWorkMinutes(node, profile), profile);
		const window = { scheduledStart, scheduledEnd };
		windows.set(node.id, window);
		if (node.workMinutes > 0) cursor = scheduledEnd;
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
