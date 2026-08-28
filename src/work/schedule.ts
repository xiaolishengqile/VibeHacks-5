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

export function subtractWorkingMinutes(target: string, minutes: number, profile: WorkProfile): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("工作分钟必须是非负整数");
	if (minutes === 0) return target;
	if (!profile.dailyCapacityMinutes.confirmed) throw new Error("每日容量尚未确认");

	const targetMs = Date.parse(target);
	if (Number.isNaN(targetMs)) throw new Error("目标时间无效");
	const offsetMinutes = parseOffsetMinutes(target);
	const startMinute = parseClock(profile.workdayStart.value);
	const configuredEnd = parseClock(profile.workdayEnd.value);
	const endMinute = Math.min(configuredEnd, startMinute + profile.dailyCapacityMinutes.value);
	if (endMinute <= startMinute) throw new Error("有效工作时段为空");

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
