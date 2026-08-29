import type { WorkProfile } from "./types.js";

const minuteMs = 60_000;

interface LocalDate {
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

interface LocalDateTime extends LocalDate {
	readonly hour: number;
	readonly minute: number;
	readonly second: number;
}

export interface WorkingWindow {
	readonly start: string;
	readonly end: string;
}

const parseClock = (clock: string): number => {
	const match = /^(\d{2}):(\d{2})$/.exec(clock);
	if (!match) throw new Error(`无效工作时间：${clock}`);
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) throw new Error(`无效工作时间：${clock}`);
	const value = hours * 60 + minutes;
	return value;
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

const timeZoneFormatter = (timeZone: string): Intl.DateTimeFormat => {
	try {
		return new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		});
	} catch {
		throw new Error(`无效个人时区：${timeZone}`);
	}
};

const zonedParts = (instantMs: number, timeZone: string): LocalDateTime => {
	const parts = new Map(timeZoneFormatter(timeZone).formatToParts(new Date(instantMs))
		.map((part) => [part.type, part.value]));
	const number = (key: Intl.DateTimeFormatPartTypes): number => Number(parts.get(key));
	return {
		year: number("year"),
		month: number("month"),
		day: number("day"),
		hour: number("hour"),
		minute: number("minute"),
		second: number("second"),
	};
};

const instantForLocal = (date: LocalDate, minuteOfDay: number, timeZone: string): number => {
	const hour = Math.floor(minuteOfDay / 60);
	const minute = minuteOfDay % 60;
	const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
	let candidate = wanted;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const observed = zonedParts(candidate, timeZone);
		const observedAsUtc = Date.UTC(
			observed.year,
			observed.month - 1,
			observed.day,
			observed.hour,
			observed.minute,
			observed.second,
		);
		const difference = wanted - observedAsUtc;
		if (difference === 0) return candidate;
		candidate += difference;
	}
	return candidate;
};

const formatInTimeZone = (instantMs: number, timeZone: string): string => {
	const local = zonedParts(instantMs, timeZone);
	const localAsUtc = Date.UTC(
		local.year,
		local.month - 1,
		local.day,
		local.hour,
		local.minute,
		local.second,
	);
	const offsetMinutes = Math.round((localAsUtc - instantMs) / minuteMs);
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absoluteOffset = Math.abs(offsetMinutes);
	return `${local.year}-${pad(local.month)}-${pad(local.day)}`
		+ `T${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`
		+ `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
};

const addLocalDays = (date: LocalDate, days: number): LocalDate => {
	const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
	return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
};

const isWeekend = (date: LocalDate): boolean => {
	const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
	return weekday === 0 || weekday === 6;
};

const nextWorkday = (date: LocalDate, direction: 1 | -1): LocalDate => {
	let candidate = addLocalDays(date, direction);
	while (isWeekend(candidate)) candidate = addLocalDays(candidate, direction);
	return candidate;
};

const workingMinutes = (
	profile: WorkProfile,
	useCapacity = true,
): { readonly start: number; readonly end: number } => {
	if (useCapacity && !profile.dailyCapacityMinutes.confirmed) throw new Error("每日容量尚未确认");
	const start = parseClock(profile.workdayStart.value);
	const configuredEnd = parseClock(profile.workdayEnd.value);
	const end = useCapacity
		? Math.min(configuredEnd, start + profile.dailyCapacityMinutes.value)
		: configuredEnd;
	if (end <= start) throw new Error("有效工作时段为空");
	return { start, end };
};

const windowForDate = (date: LocalDate, profile: WorkProfile): WorkingWindow => {
	const window = workingMinutes(profile);
	const timeZone = profile.timezone.value;
	return {
		start: formatInTimeZone(instantForLocal(date, window.start, timeZone), timeZone),
		end: formatInTimeZone(instantForLocal(date, window.end, timeZone), timeZone),
	};
};

const workdayWindowForDate = (date: LocalDate, profile: WorkProfile): WorkingWindow => {
	const window = workingMinutes(profile, false);
	const timeZone = profile.timezone.value;
	return {
		start: formatInTimeZone(instantForLocal(date, window.start, timeZone), timeZone),
		end: formatInTimeZone(instantForLocal(date, window.end, timeZone), timeZone),
	};
};

export function workingWindowAt(value: string, profile: WorkProfile): WorkingWindow | null {
	const instantMs = Date.parse(value);
	if (Number.isNaN(instantMs)) throw new Error("当前时间无效");
	const local = zonedParts(instantMs, profile.timezone.value);
	const date = { year: local.year, month: local.month, day: local.day };
	return isWeekend(date) ? null : windowForDate(date, profile);
}

export function workdayWindowAt(value: string, profile: WorkProfile): WorkingWindow | null {
	const instantMs = Date.parse(value);
	if (Number.isNaN(instantMs)) throw new Error("固定事项时间无效");
	const local = zonedParts(instantMs, profile.timezone.value);
	const date = { year: local.year, month: local.month, day: local.day };
	return isWeekend(date) ? null : workdayWindowForDate(date, profile);
}

export function isWithinWorkday(value: string, profile: WorkProfile): boolean {
	const instantMs = Date.parse(value);
	if (Number.isNaN(instantMs)) return false;
	const local = zonedParts(instantMs, profile.timezone.value);
	if (isWeekend(local)) return false;
	const window = workingMinutes(profile, false);
	const minute = local.hour * 60 + local.minute;
	return minute >= window.start && minute < window.end;
}

export function alignToWorkingTime(
	value: string,
	profile: WorkProfile,
	_referenceOffset: string,
): string {
	const valueMs = Date.parse(value);
	if (Number.isNaN(valueMs)) throw new Error("当前时间无效");
	const timeZone = profile.timezone.value;
	const window = workingMinutes(profile);
	const local = zonedParts(valueMs, timeZone);
	let date: LocalDate = { year: local.year, month: local.month, day: local.day };
	if (isWeekend(date)) {
		while (isWeekend(date)) date = addLocalDays(date, 1);
		return formatInTimeZone(instantForLocal(date, window.start, timeZone), timeZone);
	}

	const minuteValue = local.hour * 60 + local.minute + (local.second > 0 ? 1 : 0);
	if (minuteValue <= window.start) {
		return formatInTimeZone(instantForLocal(date, window.start, timeZone), timeZone);
	}
	const rounded = Math.ceil(minuteValue / 15) * 15;
	if (rounded >= window.end) {
		date = nextWorkday(date, 1);
		return formatInTimeZone(instantForLocal(date, window.start, timeZone), timeZone);
	}
	return formatInTimeZone(instantForLocal(date, rounded, timeZone), timeZone);
}

export function addWorkingMinutes(start: string, minutes: number, profile: WorkProfile): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("工作分钟必须是非负整数");
	if (minutes === 0) return start;
	let cursor = alignToWorkingTime(start, profile, start);
	let remaining = minutes;
	while (remaining > 0) {
		const window = workingWindowAt(cursor, profile);
		if (!window) {
			cursor = alignToWorkingTime(cursor, profile, cursor);
			continue;
		}
		const available = Math.max(0, Math.floor((Date.parse(window.end) - Date.parse(cursor)) / minuteMs));
		const used = Math.min(available, remaining);
		cursor = formatInTimeZone(Date.parse(cursor) + used * minuteMs, profile.timezone.value);
		remaining -= used;
		if (remaining > 0) cursor = alignToWorkingTime(window.end, profile, window.end);
	}
	return cursor;
}

export function subtractWorkingMinutes(target: string, minutes: number, profile: WorkProfile): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("工作分钟必须是非负整数");
	if (minutes === 0) return target;
	const targetMs = Date.parse(target);
	if (Number.isNaN(targetMs)) throw new Error("目标时间无效");
	const timeZone = profile.timezone.value;
	const local = zonedParts(targetMs, timeZone);
	let date: LocalDate = { year: local.year, month: local.month, day: local.day };
	let cursor = targetMs;
	let remaining = minutes;
	while (remaining > 0) {
		if (isWeekend(date)) {
			date = nextWorkday(date, -1);
			cursor = Date.parse(windowForDate(date, profile).end);
			continue;
		}
		const window = windowForDate(date, profile);
		const startMs = Date.parse(window.start);
		const endMs = Date.parse(window.end);
		cursor = Math.min(cursor, endMs);
		if (cursor <= startMs) {
			date = nextWorkday(date, -1);
			cursor = Date.parse(windowForDate(date, profile).end);
			continue;
		}
		const available = Math.floor((cursor - startMs) / minuteMs);
		const used = Math.min(available, remaining);
		cursor -= used * minuteMs;
		remaining -= used;
		if (remaining > 0) {
			date = nextWorkday(date, -1);
			cursor = Date.parse(windowForDate(date, profile).end);
		}
	}
	return formatInTimeZone(cursor, timeZone);
}

export function subtractCalendarMinutes(target: string, minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("等待分钟必须是非负整数");
	const offset = parseOffsetMinutes(target);
	return formatWithOffset(Date.parse(target) - minutes * minuteMs, offset);
}

export function addCalendarMinutes(start: string, minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("自然分钟必须是非负整数");
	const offset = parseOffsetMinutes(start);
	return formatWithOffset(Date.parse(start) + minutes * minuteMs, offset);
}
