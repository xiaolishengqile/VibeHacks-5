import assert from "node:assert/strict";
import test from "node:test";

import { buildForwardSchedule } from "../../src/work/forward-schedule.js";
import { createProfile } from "../../src/work/profile.js";
import type { WorkNode } from "../../src/work/types.js";

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

test("依赖任务先执行，外部等待按自然时间推进下游任务", () => {
	const nodes: readonly WorkNode[] = [
		{
			id: "request",
			goalId: "goal_1",
			title: "索取数据",
			owner: "self",
			workMinutes: 10,
			waitMinutes: 1440,
			dependencyIds: [],
			status: "ready",
		},
		{
			id: "draft",
			goalId: "goal_1",
			title: "撰写文稿",
			owner: "self",
			workMinutes: 90,
			waitMinutes: 0,
			dependencyIds: ["request"],
			status: "planned",
		},
	];
	const windows = buildForwardSchedule(
		nodes,
		new Map([
			["request", "2026-08-31T15:00:00+08:00"],
			["draft", "2026-09-01T15:00:00+08:00"],
		]),
		profile,
		"2026-08-29T14:07:00+08:00",
		"2026-09-04T18:00:00+08:00",
	);

	assert.deepEqual([...windows.entries()], [
		["request", {
			scheduledStart: "2026-08-31T09:00:00+08:00",
			scheduledEnd: "2026-08-31T09:15:00+08:00",
		}],
		["draft", {
			scheduledStart: "2026-09-01T09:15:00+08:00",
			scheduledEnd: "2026-09-01T11:15:00+08:00",
		}],
	]);
});

test("每日容量用完后推进到下一工作日且不安排周末", () => {
	const nodes: readonly WorkNode[] = [
		{
			id: "full_day",
			goalId: "goal_1",
			title: "整日梳理",
			owner: "self",
			workMinutes: 350,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready",
		},
		{
			id: "next",
			goalId: "goal_1",
			title: "继续完善",
			owner: "self",
			workMinutes: 60,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready",
		},
	];
	const windows = buildForwardSchedule(
		nodes,
		new Map([
			["full_day", "2026-08-28T16:00:00+08:00"],
			["next", "2026-08-31T16:00:00+08:00"],
		]),
		profile,
		"2026-08-28T09:00:00+08:00",
		"2026-09-04T18:00:00+08:00",
	);

	assert.deepEqual(windows.get("full_day"), {
		scheduledStart: "2026-08-28T09:00:00+08:00",
		scheduledEnd: "2026-08-28T16:00:00+08:00",
	});
	assert.deepEqual(windows.get("next"), {
		scheduledStart: "2026-08-31T09:00:00+08:00",
		scheduledEnd: "2026-08-31T10:15:00+08:00",
	});
	for (const window of windows.values()) {
		assert.equal([0, 6].includes(new Date(window.scheduledStart).getUTCDay()), false);
	}
});
