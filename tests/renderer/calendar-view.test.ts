import assert from "node:assert/strict";
import test from "node:test";

import { emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import { toCalendarWindowView, toWeekCalendarView, weekOffsetDeltaFromSwipe } from "../../src/renderer/calendar-view.js";

const shanghaiProfile = {
	timezone: "Asia/Shanghai",
	workdayStart: "09:00",
	workdayEnd: "18:00",
	dailyCapacityMinutes: 360,
	bufferPercent: 20,
	confirmed: true,
} as const;

test("周日历从周一开始并把工作节点放入对应日期", () => {
	const snapshot = {
		...emptyApplicationSnapshot(),
		profile: shanghaiProfile,
		nodes: [
			{
				id: "node_data",
				goalId: "goal_review",
				title: "找小王拿数据",
				owner: "小王",
				workMinutes: 30,
				waitMinutes: 480,
				dependencyIds: [],
				status: "ready" as const,
			},
			{
				id: "node_framework",
				goalId: "goal_review",
				title: "搭建复盘框架",
				owner: "self",
				workMinutes: 90,
				waitMinutes: 0,
				dependencyIds: ["node_data"],
				status: "planned" as const,
			},
		],
		decisions: [
			{
				nodeId: "node_data",
				title: "找小王拿数据",
				latestStart: "2026-08-26T09:30:00+08:00",
				scheduledStart: "2026-08-26T09:30:00+08:00",
				scheduledEnd: "2026-08-26T11:00:00+08:00",
				targetAt: "2026-08-26T18:00:00+08:00",
				recommendedAction: "start" as const,
				risk: "high" as const,
				reason: "需要预留等待时间",
			},
			{
				nodeId: "node_framework",
				title: "搭建复盘框架",
				latestStart: "2026-08-28T14:00:00+08:00",
				scheduledStart: "2026-08-28T14:00:00+08:00",
				scheduledEnd: "2026-08-28T15:30:00+08:00",
				targetAt: "2026-08-28T18:00:00+08:00",
				recommendedAction: "later" as const,
				risk: "low" as const,
				reason: "等待数据后开始",
			},
		],
	};

	const calendar = toWeekCalendarView(snapshot, "2026-08-25T10:00:00+08:00");

	assert.equal(calendar.rangeLabel, "8月24日—8月30日");
	assert.deepEqual(calendar.days.map((day) => day.weekday), ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
	assert.deepEqual(calendar.days[2]?.items.map((item) => [item.title, item.timeLabel, item.owner, item.tone, item.dateTime]), [
		["找小王拿数据", "09:30—11:00", "小王", "urgent", "2026-08-26T09:30:00+08:00"],
	]);
	assert.deepEqual(calendar.days[4]?.items.map((item) => [item.title, item.timeLabel, item.owner, item.tone]), [
		["搭建复盘框架", "14:00—15:30", "自己", "planned"],
	]);
	assert.equal(calendar.days[2]?.scheduledMinutes, 90);
	assert.equal(calendar.days[2]?.reservedMinutes, 450);
	for (const day of calendar.days.slice(5)) {
		assert.equal(day.items.length, 0);
		assert.equal(day.scheduledMinutes, 0);
		assert.equal(day.reservedMinutes, 0);
	}
	assert.equal(calendar.focusDayKey, "2026-08-26");
	assert.equal(calendar.focusItemId, "node_data");
	assert.equal(calendar.outsideWeekCount, 0);
});

test("没有计划时日历显示当前周并聚焦今天", () => {
	const calendar = toWeekCalendarView({
		...emptyApplicationSnapshot(),
		profile: shanghaiProfile,
	}, "2026-08-29T08:00:00+08:00");

	assert.equal(calendar.rangeLabel, "8月24日—8月30日");
	assert.equal(calendar.focusDayKey, "2026-08-29");
	assert.equal(calendar.focusItemId, null);
	assert.equal(calendar.days.find((day) => day.isToday)?.weekday, "周六");
	assert.equal(calendar.days.every((day) => day.items.length === 0), true);
	assert.equal(calendar.days[5]?.scheduledMinutes, 0);
	assert.equal(calendar.days[5]?.reservedMinutes, 0);
});

test("日历按用户时区处理跨日和夏令时", () => {
	const snapshot = {
		...emptyApplicationSnapshot(),
		profile: {
			timezone: "America/Los_Angeles",
			workdayStart: "09:00",
			workdayEnd: "18:00",
			dailyCapacityMinutes: 360,
			bufferPercent: 20,
			confirmed: true,
		},
		nodes: [{
			id: "node_midnight",
			goalId: "goal_timezone",
			title: "跨时区检查",
			owner: "self",
			workMinutes: 30,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
		}],
		decisions: [{
			nodeId: "node_midnight",
			title: "跨时区检查",
			latestStart: "2026-08-25T00:30:00+08:00",
			scheduledStart: "2026-08-25T00:30:00+08:00",
			scheduledEnd: "2026-08-25T00:30:00+08:00",
			targetAt: "2026-08-25T01:00:00+08:00",
			recommendedAction: "start" as const,
			risk: "medium" as const,
			reason: "跨时区验证",
		}],
	};

	const calendar = toWeekCalendarView(snapshot, "2026-08-24T12:00:00Z");

	assert.equal(calendar.rangeLabel, "8月24日—8月30日");
	assert.equal(calendar.focusDayKey, "2026-08-24");
	assert.deepEqual(calendar.days[0]?.items.map((item) => [item.title, item.timeLabel]), [["跨时区检查", "09:30"]]);

	const fallback = toWeekCalendarView({
		...snapshot,
		decisions: [{
			...snapshot.decisions[0]!,
			latestStart: "2026-11-02T09:30:00Z",
			scheduledStart: "2026-11-02T09:30:00Z",
			scheduledEnd: "2026-11-02T09:30:00Z",
		}],
	}, "2026-11-02T12:00:00Z");
	assert.equal(fallback.rangeLabel, "11月2日—11月8日");
	assert.equal(fallback.days[0]?.items[0]?.timeLabel, "01:30");
});

test("跨年周显示年份并提示其他周仍有安排", () => {
	const first = {
		id: "node_year_end",
		goalId: "goal_year",
		title: "年终复盘",
		owner: "self",
		workMinutes: 60,
		waitMinutes: 0,
		dependencyIds: [] as string[],
		status: "ready" as const,
	};
	const second = { ...first, id: "node_next_week", title: "下一周计划" };
	const snapshot = {
		...emptyApplicationSnapshot(),
		profile: {
			timezone: "Asia/Shanghai",
			workdayStart: "09:00",
			workdayEnd: "18:00",
			dailyCapacityMinutes: 360,
			bufferPercent: 20,
			confirmed: true,
		},
		nodes: [first, second],
		decisions: [
			{
				nodeId: first.id,
				title: first.title,
				latestStart: "2025-12-31T10:00:00+08:00",
				scheduledStart: "2025-12-31T10:00:00+08:00",
				scheduledEnd: "2025-12-31T10:00:00+08:00",
				targetAt: "2025-12-31T18:00:00+08:00",
				recommendedAction: "start" as const,
				risk: "low" as const,
				reason: "年终安排",
			},
			{
				nodeId: second.id,
				title: second.title,
				latestStart: "2026-01-07T10:00:00+08:00",
				scheduledStart: "2026-01-07T10:00:00+08:00",
				scheduledEnd: "2026-01-07T10:00:00+08:00",
				targetAt: "2026-01-07T18:00:00+08:00",
				recommendedAction: "later" as const,
				risk: "low" as const,
				reason: "下一周安排",
			},
		],
	};

	const calendar = toWeekCalendarView(snapshot, "2025-12-30T10:00:00+08:00");

	assert.equal(calendar.rangeLabel, "2025年12月29日—2026年1月4日");
	assert.equal(calendar.outsideWeekCount, 1);
});

test("周日历可以切换到上下周并显示对应任务", () => {
	const node = (id: string, title: string) => ({
		id,
		goalId: "goal_review",
		title,
		owner: "self",
		workMinutes: 30,
		waitMinutes: 0,
		dependencyIds: [] as string[],
		status: "ready" as const,
	});
	const previous = node("previous", "整理上周遗留");
	const current = node("current", "本周收集数据");
	const next = node("next", "下周完成复盘");
	const decision = (entry: typeof current, latestStart: string) => ({
		nodeId: entry.id,
		title: entry.title,
		latestStart,
		scheduledStart: latestStart,
		scheduledEnd: latestStart,
		targetAt: latestStart,
		recommendedAction: "start" as const,
		risk: "low" as const,
		reason: "排期验证",
	});
	const snapshot = {
		...emptyApplicationSnapshot(),
		profile: shanghaiProfile,
		nodes: [current, previous, next],
		decisions: [
			decision(current, "2026-08-26T10:00:00+08:00"),
			decision(previous, "2026-08-20T10:00:00+08:00"),
			decision(next, "2026-09-02T10:00:00+08:00"),
		],
	};

	const previousWeek = toWeekCalendarView(snapshot, "2026-08-26T09:00:00+08:00", -1);
	const nextWeek = toWeekCalendarView(snapshot, "2026-08-26T09:00:00+08:00", 1);

	assert.equal(previousWeek.rangeLabel, "8月17日—8月23日");
	assert.deepEqual(previousWeek.days.flatMap((day) => day.items.map((item) => item.title)), ["整理上周遗留"]);
	assert.equal(nextWeek.rangeLabel, "8月31日—9月6日");
	assert.deepEqual(nextWeek.days.flatMap((day) => day.items.map((item) => item.title)), ["下周完成复盘"]);
});

test("日历窗口可以从任意一天开始连续显示七天", () => {
	const anchor = {
		id: "anchor",
		goalId: "goal_review",
		title: "本周启动",
		owner: "self",
		workMinutes: 30,
		waitMinutes: 0,
		dependencyIds: [] as string[],
		status: "ready" as const,
	};
	const later = {
		id: "day_stop",
		goalId: "goal_review",
		title: "9月交付",
		owner: "self",
		workMinutes: 30,
		waitMinutes: 0,
		dependencyIds: [] as string[],
		status: "ready" as const,
	};
	const snapshot = {
		...emptyApplicationSnapshot(),
		profile: shanghaiProfile,
		nodes: [anchor, later],
		decisions: [
			{
				nodeId: anchor.id,
				title: anchor.title,
				latestStart: "2026-08-24T10:00:00+08:00",
				scheduledStart: "2026-08-24T10:00:00+08:00",
				scheduledEnd: "2026-08-24T10:00:00+08:00",
				targetAt: "2026-08-24T18:00:00+08:00",
				recommendedAction: "start" as const,
				risk: "low" as const,
				reason: "日历基准",
			},
			{
				nodeId: later.id,
				title: later.title,
				latestStart: "2026-09-01T10:00:00+08:00",
				scheduledStart: "2026-09-01T10:00:00+08:00",
				scheduledEnd: "2026-09-01T10:00:00+08:00",
				targetAt: "2026-09-01T18:00:00+08:00",
				recommendedAction: "later" as const,
				risk: "low" as const,
				reason: "按天停留验证",
			},
		],
	};

	const calendar = toCalendarWindowView(snapshot, "2026-08-26T09:00:00+08:00", 2);

	assert.equal(calendar.rangeLabel, "8月26日—9月1日");
	assert.deepEqual(calendar.days.map((day) => day.dateLabel), [
		"8月26日", "8月27日", "8月28日", "8月29日", "8月30日", "8月31日", "9月1日",
	]);
	assert.deepEqual(calendar.days[6]?.items.map((item) => item.title), ["9月交付"]);
	assert.equal(calendar.focusDayKey, "2026-09-01");
	assert.equal(calendar.focusItemId, "day_stop");
});

test("水平滑动只在足够距离时切换周", () => {
	assert.equal(weekOffsetDeltaFromSwipe(320, 180), 1);
	assert.equal(weekOffsetDeltaFromSwipe(180, 320), -1);
	assert.equal(weekOffsetDeltaFromSwipe(200, 170), 0);
});
