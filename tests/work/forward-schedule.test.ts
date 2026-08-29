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
			scheduledSegments: [{
				scheduledStart: "2026-08-31T09:00:00+08:00",
				scheduledEnd: "2026-08-31T09:15:00+08:00",
			}],
		}],
		["draft", {
			scheduledStart: "2026-09-01T09:15:00+08:00",
			scheduledEnd: "2026-09-01T11:15:00+08:00",
			scheduledSegments: [{
				scheduledStart: "2026-09-01T09:15:00+08:00",
				scheduledEnd: "2026-09-01T11:15:00+08:00",
			}],
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
		scheduledSegments: [{
			scheduledStart: "2026-08-28T09:00:00+08:00",
			scheduledEnd: "2026-08-28T16:00:00+08:00",
		}],
	});
	assert.deepEqual(windows.get("next"), {
		scheduledStart: "2026-08-31T09:00:00+08:00",
		scheduledEnd: "2026-08-31T10:15:00+08:00",
		scheduledSegments: [{
			scheduledStart: "2026-08-31T09:00:00+08:00",
			scheduledEnd: "2026-08-31T10:15:00+08:00",
		}],
	});
	for (const window of windows.values()) {
		assert.equal([0, 6].includes(new Date(window.scheduledStart).getUTCDay()), false);
	}
});

test("当前工作日剩余容量不足时把完整任务移到下一工作日", () => {
	const node: WorkNode = {
		id: "late_task",
		goalId: "goal_1",
		title: "下午临时任务",
		owner: "self",
		workMinutes: 75,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready",
	};
	const window = buildForwardSchedule(
		[node],
		new Map([[node.id, "2026-08-31T16:00:00+08:00"]]),
		profile,
		"2026-08-28T15:30:00+08:00",
		"2026-09-04T18:00:00Z",
	).get(node.id);

	assert.deepEqual(window, {
		scheduledStart: "2026-08-31T09:00:00+08:00",
		scheduledEnd: "2026-08-31T10:30:00+08:00",
		scheduledSegments: [{
			scheduledStart: "2026-08-31T09:00:00+08:00",
			scheduledEnd: "2026-08-31T10:30:00+08:00",
		}],
	});
});

test("超过每日容量的任务拆成逐日工作时段", () => {
	const node: WorkNode = {
		id: "large_task",
		goalId: "goal_1",
		title: "集中制作材料",
		owner: "self",
		workMinutes: 600,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready",
	};
	const window = buildForwardSchedule(
		[node],
		new Map([[node.id, "2026-09-04T16:00:00+08:00"]]),
		profile,
		"2026-08-31T09:00:00+08:00",
		"2026-09-04T18:00:00+08:00",
	).get(node.id);

	assert.deepEqual(window?.scheduledSegments, [{
		scheduledStart: "2026-08-31T09:00:00+08:00",
		scheduledEnd: "2026-08-31T16:00:00+08:00",
	}, {
		scheduledStart: "2026-09-01T09:00:00+08:00",
		scheduledEnd: "2026-09-01T14:00:00+08:00",
	}]);
});

test("已完成依赖不再重复施加等待时间", () => {
	const nodes: readonly WorkNode[] = [{
		id: "done_request",
		goalId: "goal_1",
		title: "已回收数据",
		owner: "小王",
		workMinutes: 15,
		waitMinutes: 4320,
		dependencyIds: [],
		status: "done",
	}, {
		id: "draft",
		goalId: "goal_1",
		title: "撰写初稿",
		owner: "self",
		workMinutes: 60,
		waitMinutes: 0,
		dependencyIds: ["done_request"],
		status: "ready",
	}];
	const windows = buildForwardSchedule(
		nodes,
		new Map([
			["done_request", "2026-09-04T14:00:00+08:00"],
			["draft", "2026-09-04T15:00:00+08:00"],
		]),
		profile,
		"2026-08-31T09:00:00+08:00",
		"2026-09-04T18:00:00+08:00",
	);

	assert.equal(windows.get("draft")?.scheduledStart, "2026-08-31T09:00:00+08:00");
});

test("依赖等待期间仍可安排无关工作", () => {
	const nodes: readonly WorkNode[] = [{
		id: "request",
		goalId: "goal_1",
		title: "索取数据",
		owner: "self",
		workMinutes: 10,
		waitMinutes: 1440,
		dependencyIds: [],
		status: "ready",
	}, {
		id: "dependent",
		goalId: "goal_1",
		title: "依赖数据的文稿",
		owner: "self",
		workMinutes: 90,
		waitMinutes: 0,
		dependencyIds: ["request"],
		status: "planned",
	}, {
		id: "independent",
		goalId: "goal_1",
		title: "整理既有材料",
		owner: "self",
		workMinutes: 60,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready",
	}];
	const windows = buildForwardSchedule(
		nodes,
		new Map([
			["request", "2026-08-31T10:00:00+08:00"],
			["dependent", "2026-08-31T11:00:00+08:00"],
			["independent", "2026-09-04T16:00:00+08:00"],
		]),
		profile,
		"2026-08-31T09:00:00+08:00",
		"2026-09-04T18:00:00+08:00",
	);

	assert.equal(windows.get("dependent")?.scheduledStart, "2026-09-01T09:15:00+08:00");
	assert.equal(windows.get("independent")?.scheduledStart, "2026-08-31T09:15:00+08:00");
});
