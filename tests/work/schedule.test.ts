import assert from "node:assert/strict";
import test from "node:test";

import { createProfile } from "../../src/work/profile.js";
import {
	addCalendarMinutes,
	addWorkingMinutes,
	alignToWorkingTime,
	isWithinWorkday,
	subtractWorkingMinutes,
	workdayWindowAt,
} from "../../src/work/schedule.js";

const profile = createProfile(
	{
		id: "profile_1",
		timezone: "Asia/Shanghai",
		workdayStart: "09:00",
		workdayEnd: "18:00",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	},
	"2026-08-28T09:00:00+08:00",
);

test("工作分钟只从工作时段和每日容量中扣除", () => {
	assert.equal(
		subtractWorkingMinutes("2026-08-31T18:00:00+08:00", 120, profile),
		"2026-08-31T14:00:00+08:00",
	);
});

test("跨周末倒排时跳过周六和周日", () => {
	assert.equal(
		subtractWorkingMinutes("2026-08-31T10:00:00+08:00", 480, profile),
		"2026-08-28T09:00:00+08:00",
	);
});

test("零分钟保持原目标时间", () => {
	assert.equal(
		subtractWorkingMinutes("2026-08-31T15:30:00+08:00", 0, profile),
		"2026-08-31T15:30:00+08:00",
	);
});

test("正向工作时间跨过下班和周末", () => {
	assert.equal(
		addWorkingMinutes("2026-08-28T15:30:00+08:00", 90, profile),
		"2026-08-31T10:00:00+08:00",
	);
});

test("周末当前时间推进到下一个工作日并对齐刻度", () => {
	assert.equal(
		alignToWorkingTime(
			"2026-08-29T14:07:00+08:00",
			profile,
			"2026-09-04T18:00:00+08:00",
		),
		"2026-08-31T09:00:00+08:00",
	);
	assert.equal(
		alignToWorkingTime(
			"2026-08-31T05:07:01Z",
			profile,
			"2026-09-04T18:00:00+08:00",
		),
		"2026-08-31T13:15:00+08:00",
	);
});

test("排期始终使用个人时区而不是截止时间偏移", () => {
	assert.equal(
		alignToWorkingTime("2026-08-31T13:00:00Z", profile, "2026-09-04T18:00:00Z"),
		"2026-09-01T09:00:00+08:00",
	);
});

test("跨夏令时后使用新日期的真实偏移", () => {
	const losAngeles = createProfile(
		{
			id: "profile_la",
			timezone: "America/Los_Angeles",
			workdayStart: "09:00",
			workdayEnd: "18:00",
			dailyCapacityMinutes: 420,
			bufferPercent: 20,
		},
		"2026-10-30T09:00:00-07:00",
	);
	assert.equal(
		addWorkingMinutes("2026-10-30T15:30:00-07:00", 90, losAngeles),
		"2026-11-02T10:00:00-08:00",
	);
});

test("工作时段校验包含个人时区、上下班和周末边界", () => {
	assert.equal(isWithinWorkday("2026-08-31T02:00:00Z", profile), true);
	assert.equal(isWithinWorkday("2026-08-31T13:00:00Z", profile), false);
	assert.equal(isWithinWorkday("2026-08-30T02:00:00Z", profile), false);
});

test("自然分钟保留固定事项开始时的时区偏移", () => {
	assert.equal(
		addCalendarMinutes("2026-08-31T10:00:00+08:00", 75),
		"2026-08-31T11:15:00+08:00",
	);
});

test("固定事项使用完整上下班区间而非每日容量", () => {
	const unconfirmedProfile = createProfile({
		id: "profile_unconfirmed",
		timezone: "Asia/Shanghai",
		workdayStart: "09:00",
		workdayEnd: "18:00",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
		source: "inferred",
	}, "2026-08-28T09:00:00+08:00");

	assert.deepEqual(
		workdayWindowAt("2026-08-31T16:00:00+08:00", unconfirmedProfile),
		{
			start: "2026-08-31T09:00:00+08:00",
			end: "2026-08-31T18:00:00+08:00",
		},
	);
});
