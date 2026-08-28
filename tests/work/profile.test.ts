import assert from "node:assert/strict";
import test from "node:test";

import {
	confirmProfileField,
	createProfile,
	recordDurationObservation,
	suggestedMinutesFor,
} from "../../src/work/profile.js";

const now = "2026-08-28T09:00:00+08:00";

test("实际耗时只影响同类型任务且保留来源", () => {
	const profile = createProfile(
		{ timezone: "Asia/Shanghai", dailyCapacityMinutes: 420, bufferPercent: 20 },
		now,
	);
	const updated = recordDurationObservation(profile, {
		taskType: "复盘框架",
		estimatedMinutes: 120,
		actualMinutes: 180,
		sourceWorkNodeId: "node_1",
		observedAt: now,
	});

	assert.equal(updated.durationObservations[0]?.actualMinutes, 180);
	assert.equal(updated.durationObservations[0]?.sourceWorkNodeId, "node_1");
	assert.equal(suggestedMinutesFor(updated, "复盘框架"), 180);
	assert.equal(suggestedMinutesFor(updated, "数据分析"), null);
});

test("推断出的个人工作字段必须由用户确认", () => {
	const profile = createProfile(
		{
			timezone: "Asia/Shanghai",
			dailyCapacityMinutes: 420,
			bufferPercent: 20,
			source: "inferred",
		},
		now,
	);

	assert.equal(profile.dailyCapacityMinutes.confirmed, false);
	const confirmed = confirmProfileField(profile, "dailyCapacityMinutes", "2026-08-28T09:05:00+08:00");
	assert.equal(confirmed.dailyCapacityMinutes.confirmed, true);
	assert.equal(confirmed.dailyCapacityMinutes.source, "user");
	assert.equal(confirmed.bufferPercent.confirmed, false);
});

test("工作模型拒绝不合理容量和缓冲", () => {
	assert.throws(
		() => createProfile({ timezone: "Asia/Shanghai", dailyCapacityMinutes: 59, bufferPercent: 20 }, now),
		/每日可用容量/,
	);
	assert.throws(
		() => createProfile({ timezone: "Asia/Shanghai", dailyCapacityMinutes: 420, bufferPercent: 101 }, now),
		/安全缓冲比例/,
	);
});

test("相同任务建议使用最近五次实际耗时的中位数", () => {
	let profile = createProfile(
		{ timezone: "Asia/Shanghai", dailyCapacityMinutes: 420, bufferPercent: 20 },
		now,
	);
	for (const [index, actualMinutes] of [30, 60, 90, 120, 150, 300].entries()) {
		profile = recordDurationObservation(profile, {
			taskType: "复盘框架",
			estimatedMinutes: 90,
			actualMinutes,
			sourceWorkNodeId: `node_${index}`,
			observedAt: `2026-08-2${index + 1}T09:00:00+08:00`,
		});
	}

	assert.equal(suggestedMinutesFor(profile, "复盘框架"), 120);
});
