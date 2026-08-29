import type { WorkProfile } from "./types.js";

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

const parseClock = (clock: string): number => {
	const [hours, minutes] = clock.split(":").map(Number);
	if (hours === undefined || minutes === undefined) throw new Error(`无效工作时间：${clock}`);
	return hours * 60 + minutes;
};

const parseOffsetMinutes = (iso: string): number => {
	if (iso.endsWith("Z")) return 0;
	const match = iso.match(/([+-])(\d{2}):(\d{2})$/);
	if (!match) throw new Error("时间必须包含明确时区偏移");
	const sign = match[1] === "+" ? 1 : -1;
	return sign * (Number(match[2]) * 60 + Number(match[3]));
};

const pad = (value: number): string => String(value).padStart(2, "0");

const formatWithOffset = (instantMs: number, offsetMinutes: number): string => {
	const local = new Date(instantMs + offsetMinutes * minuteMs);
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absoluteOffset = Math.abs(offsetMinutes);
	return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`
		+ `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
		+ `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
};

const localDayStartMs = (instantMs: number, offsetMinutes: number): number => {
	const shifted = new Date(instantMs + offsetMinutes * minuteMs);
	return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
		- offsetMinutes * minuteMs;
};

const isWeekend = (dayStartMs: number, offsetMinutes: number): boolean => {
	const weekday = new Date(dayStartMs + offsetMinutes * minuteMs).getUTCDay();
	return weekday === 0 || weekday === 6;
};

const workingMinutes = (profile: WorkProfile): { readonly start: number; readonly end: number } => {
	if (!profile.dailyCapacityMinutes.confirmed) throw new Error("每日容量尚未确认");
	const start = parseClock(profile.workdayStart.value);
	const configuredEnd = parseClock(profile.workdayEnd.value);
	const end = Math.min(configuredEnd, start + profile.dailyCapacityMinutes.value);
	if (end <= start) throw new Error("有效工作时段为空");
	return { start, end };
};

const nextWorkingDayStart = (
	dayStartMs: number,
	offsetMinutes: number,
	startMinute: number,
): number => {
	let nextDay = dayStartMs + dayMs;
	while (isWeekend(nextDay, offsetMinutes)) nextDay += dayMs;
	return nextDay + startMinute * minuteMs;
};

export function alignToWorkingTime(
	value: string,
	profile: WorkProfile,
	referenceOffset: string,
): string {
	const valueMs = Date.parse(value);
	if (Number.isNaN(valueMs)) throw new Error("当前时间无效");
	const offsetMinutes = parseOffsetMinutes(referenceOffset);
	const window = workingMinutes(profile);
	let dayStart = localDayStartMs(valueMs, offsetMinutes);
	if (isWeekend(dayStart, offsetMinutes)) {
		while (isWeekend(dayStart, offsetMinutes)) dayStart += dayMs;
		return formatWithOffset(dayStart + window.start * minuteMs, offsetMinutes);
	}

	const workStart = dayStart + window.start * minuteMs;
	const workEnd = dayStart + window.end * minuteMs;
	if (valueMs <= workStart) return formatWithOffset(workStart, offsetMinutes);
	if (valueMs >= workEnd) {
		return formatWithOffset(nextWorkingDayStart(dayStart, offsetMinutes, window.start), offsetMinutes);
	}

	const elapsed = valueMs - dayStart;
	const rounded = dayStart + Math.ceil(elapsed / (15 * minuteMs)) * 15 * minuteMs;
	return rounded < workEnd
		? formatWithOffset(rounded, offsetMinutes)
		: formatWithOffset(nextWorkingDayStart(dayStart, offsetMinutes, window.start), offsetMinutes);
}

export function addWorkingMinutes(start: string, minutes: number, profile: WorkProfile): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("工作分钟必须是非负整数");
	if (minutes === 0) return start;
	const offsetMinutes = parseOffsetMinutes(start);
	const window = workingMinutes(profile);
	let cursor = Date.parse(alignToWorkingTime(start, profile, start));
	let remaining = minutes;

	while (remaining > 0) {
		const dayStart = localDayStartMs(cursor, offsetMinutes);
		const workEnd = dayStart + window.end * minuteMs;
		const available = Math.max(0, Math.floor((workEnd - cursor) / minuteMs));
		const used = Math.min(available, remaining);
		cursor += used * minuteMs;
		remaining -= used;
		if (remaining > 0) cursor = nextWorkingDayStart(dayStart, offsetMinutes, window.start);
	}

	return formatWithOffset(cursor, offsetMinutes);
}

export function subtractWorkingMinutes(target: string, minutes: number, profile: WorkProfile): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("工作分钟必须是非负整数");
	if (minutes === 0) return target;
	const targetMs = Date.parse(target);
	if (Number.isNaN(targetMs)) throw new Error("目标时间无效");
	const offsetMinutes = parseOffsetMinutes(target);
	const { start: startMinute, end: endMinute } = workingMinutes(profile);

	let cursor = targetMs;
	let remaining = minutes;
	while (remaining > 0) {
		let dayStart = localDayStartMs(cursor, offsetMinutes);
		while (isWeekend(dayStart, offsetMinutes)) dayStart -= dayMs;

		const workStart = dayStart + startMinute * minuteMs;
		const workEnd = dayStart + endMinute * minuteMs;
		if (cursor > workEnd) cursor = workEnd;
		if (cursor <= workStart || isWeekend(localDayStartMs(cursor, offsetMinutes), offsetMinutes)) {
			cursor = dayStart - dayMs + endMinute * minuteMs;
			continue;
		}

		const available = Math.floor((cursor - workStart) / minuteMs);
		const used = Math.min(available, remaining);
		cursor -= used * minuteMs;
		remaining -= used;
		if (remaining > 0) cursor = dayStart - dayMs + endMinute * minuteMs;
	}

	return formatWithOffset(cursor, offsetMinutes);
}

export function subtractCalendarMinutes(target: string, minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("等待分钟必须是非负整数");
	const offset = parseOffsetMinutes(target);
	return formatWithOffset(Date.parse(target) - minutes * minuteMs, offset);
}
