import { randomUUID } from "node:crypto";

import type {
	ConfirmedValue,
	DurationObservation,
	WorkProfile,
} from "./types.js";

export type ProfileField =
	| "timezone"
	| "workdayStart"
	| "workdayEnd"
	| "dailyCapacityMinutes"
	| "bufferPercent";

const profileFields: readonly ProfileField[] = [
	"timezone",
	"workdayStart",
	"workdayEnd",
	"dailyCapacityMinutes",
	"bufferPercent",
];

export interface CreateProfileInput {
	readonly id?: string;
	readonly timezone: string;
	readonly workdayStart?: string;
	readonly workdayEnd?: string;
	readonly dailyCapacityMinutes: number;
	readonly bufferPercent: number;
	readonly source?: "user" | "inferred";
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const checkedInteger = (value: number, minimum: number, maximum: number, label: string): number => {
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new RangeError(`${label}必须在 ${minimum} 到 ${maximum} 之间`);
	}
	return value;
};

const checkedTime = (value: string, label: string): string => {
	if (!timePattern.test(value)) throw new RangeError(`${label}必须使用 HH:mm 格式`);
	return value;
};

const field = <T>(
	value: T,
	source: "user" | "inferred",
	updatedAt: string,
): ConfirmedValue<T> => ({
	value,
	confirmed: source === "user",
	source,
	updatedAt,
});

export function createProfile(input: CreateProfileInput, now: string): WorkProfile {
	if (!input.timezone.trim()) throw new RangeError("时区不能为空");
	const workdayStart = checkedTime(input.workdayStart ?? "09:00", "工作开始时间");
	const workdayEnd = checkedTime(input.workdayEnd ?? "18:00", "工作结束时间");
	if (workdayStart >= workdayEnd) throw new RangeError("工作结束时间必须晚于开始时间");
	const source = input.source ?? "user";

	return {
		id: input.id ?? `profile_${randomUUID()}`,
		timezone: field(input.timezone.trim(), source, now),
		workdayStart: field(workdayStart, source, now),
		workdayEnd: field(workdayEnd, source, now),
		dailyCapacityMinutes: field(
			checkedInteger(input.dailyCapacityMinutes, 60, 960, "每日可用容量"),
			source,
			now,
		),
		bufferPercent: field(
			checkedInteger(input.bufferPercent, 0, 100, "安全缓冲比例"),
			source,
			now,
		),
		durationObservations: [],
		waitingObservations: [],
	};
}

export function confirmProfileField(
	profile: WorkProfile,
	fieldName: ProfileField,
	confirmedAt: string,
): WorkProfile {
	return {
		...profile,
		[fieldName]: {
			...profile[fieldName],
			confirmed: true,
			source: "user",
			updatedAt: confirmedAt,
		},
	};
}

export function isProfileConfirmed(profile: WorkProfile): boolean {
	return profileFields.every((fieldName) => profile[fieldName].confirmed);
}

export function confirmProfile(profile: WorkProfile, confirmedAt: string): WorkProfile {
	return profileFields.reduce(
		(current, fieldName) => confirmProfileField(current, fieldName, confirmedAt),
		profile,
	);
}

export function recordDurationObservation(
	profile: WorkProfile,
	observation: DurationObservation,
): WorkProfile {
	if (!observation.taskType.trim()) throw new RangeError("任务类型不能为空");
	checkedInteger(observation.estimatedMinutes, 0, 525_600, "预计耗时");
	checkedInteger(observation.actualMinutes, 1, 525_600, "实际耗时");
	if (!observation.sourceWorkNodeId.trim()) throw new RangeError("来源工作节点不能为空");

	return {
		...profile,
		durationObservations: [
			...profile.durationObservations,
			{ ...observation, taskType: observation.taskType.trim() },
		],
	};
}

export function suggestedMinutesFor(profile: WorkProfile, taskType: string): number | null {
	const values = profile.durationObservations
		.filter((observation) => observation.taskType === taskType)
		.slice(-5)
		.map((observation) => observation.actualMinutes)
		.sort((left, right) => left - right);
	if (values.length === 0) return null;
	const middle = Math.floor(values.length / 2);
	if (values.length % 2 === 1) return values[middle] ?? null;
	return Math.round(((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2);
}
