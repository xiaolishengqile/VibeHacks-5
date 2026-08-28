import assert from "node:assert/strict";
import test from "node:test";

import { migrateDatabase, openDatabase } from "../../src/storage/database.js";
import { SqliteWorkRepository } from "../../src/storage/work-repository.js";
import { createProfile, recordDurationObservation } from "../../src/work/profile.js";
import type { StoredWorkAggregate } from "../../src/work/repositories.js";

const profile = recordDurationObservation(
	createProfile(
		{
			id: "profile_1",
			timezone: "Asia/Shanghai",
			dailyCapacityMinutes: 420,
			bufferPercent: 20,
		},
		"2026-08-28T09:00:00+08:00",
	),
	{
		taskType: "复盘框架",
		estimatedMinutes: 120,
		actualMinutes: 150,
		sourceWorkNodeId: "outline",
		observedAt: "2026-08-28T15:00:00+08:00",
	},
);

const aggregate: StoredWorkAggregate = {
	profile,
	goal: {
		id: "goal_1",
		title: "季度复盘",
		description: "预计等待一天",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [
			{
				id: "review",
				title: "老板审核",
				at: "2026-09-02T18:00:00+08:00",
				nodeIds: ["outline"],
			},
		],
		status: "active",
		createdAt: "2026-08-28T09:00:00+08:00",
		updatedAt: "2026-08-28T09:00:00+08:00",
	},
	nodes: [
		{
			id: "request_data",
			goalId: "goal_1",
			title: "找小王拿数据",
			owner: "小王",
			workMinutes: 5,
			waitMinutes: 1440,
			dependencyIds: [],
			status: "waiting",
		},
		{
			id: "outline",
			goalId: "goal_1",
			title: "搭建复盘框架",
			owner: "self",
			workMinutes: 120,
			waitMinutes: 0,
			dependencyIds: ["request_data"],
			status: "review",
			actualMinutes: 150,
		},
	],
	changes: [
		{
			id: "change_1",
			kind: "ownerChanged",
			reason: "协作方由小王变更为小赵",
			createdAt: "2026-08-28T10:00:00+08:00",
		},
	],
};

test("工作仓储完整往返保存工作聚合", async () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	const repository = new SqliteWorkRepository(database);

	await repository.saveAggregate(aggregate);
	assert.deepEqual(await repository.loadAggregate(aggregate.goal.id), aggregate);
	database.close();
});

test("重复保存会替换聚合而不会累积旧关系", async () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	const repository = new SqliteWorkRepository(database);

	await repository.saveAggregate(aggregate);
	await repository.saveAggregate({
		...aggregate,
		goal: { ...aggregate.goal, milestones: [] },
		nodes: [aggregate.nodes[0]!],
	});
	const stored = await repository.loadAggregate(aggregate.goal.id);
	assert.deepEqual(stored?.nodes.map((node) => node.id), ["request_data"]);
	assert.deepEqual(stored?.goal.milestones, []);
	database.close();
});

test("能够恢复最近更新的工作聚合", async () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	const repository = new SqliteWorkRepository(database);
	const newer: StoredWorkAggregate = {
		...aggregate,
		goal: {
			...aggregate.goal,
			id: "goal_2",
			title: "新工作计划",
			milestones: [],
			createdAt: "2026-08-29T09:00:00+08:00",
			updatedAt: "2026-08-29T09:00:00+08:00",
		},
		nodes: [],
		changes: [],
	};

	await repository.saveAggregate(aggregate);
	await repository.saveAggregate(newer);

	assert.equal((await repository.loadLatestAggregate())?.goal.id, "goal_2");
	database.close();
});
