import assert from "node:assert/strict";
import test from "node:test";

import { createProfile } from "../../src/work/profile.js";
import {
	addWorkingMinutes,
	alignToWorkingTime,
	subtractWorkingMinutes,
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
