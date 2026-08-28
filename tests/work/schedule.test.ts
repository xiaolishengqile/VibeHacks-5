import assert from "node:assert/strict";
import test from "node:test";

import { createProfile } from "../../src/work/profile.js";
import { subtractWorkingMinutes } from "../../src/work/schedule.js";

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
