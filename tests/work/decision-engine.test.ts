import assert from "node:assert/strict";
import test from "node:test";

import { DecisionEngine } from "../../src/work/decision-engine.js";
import { WorkGraph } from "../../src/work/graph.js";
import { createProfile } from "../../src/work/profile.js";
import type { WorkGoal, WorkNode } from "../../src/work/types.js";

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

const goal: WorkGoal = {
	id: "goal_1",
	title: "季度复盘",
	description: "",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [
		{
			id: "milestone_review",
			title: "老板审核",
			at: "2026-09-02T18:00:00+08:00",
			nodeIds: ["build_outline", "analyze_data", "build_deck"],
		},
	],
	status: "active",
	createdAt: "2026-08-28T09:00:00+08:00",
	updatedAt: "2026-08-28T09:00:00+08:00",
};

const nodes: readonly WorkNode[] = [
	{
		id: "request_data",
		goalId: goal.id,
		title: "找小王拿数据",
		owner: "小王",
		workMinutes: 5,
		waitMinutes: 1440,
		dependencyIds: [],
		status: "ready",
	},
	{
		id: "build_outline",
		goalId: goal.id,
		title: "搭建复盘框架",
		owner: "self",
		workMinutes: 180,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready",
	},
	{
		id: "analyze_data",
		goalId: goal.id,
		title: "完成数据分析",
		owner: "self",
		workMinutes: 180,
		waitMinutes: 0,
		dependencyIds: ["request_data"],
		status: "planned",
	},
	{
		id: "build_deck",
		goalId: goal.id,
		title: "生成汇报材料",
		owner: "self",
		workMinutes: 180,
		waitMinutes: 0,
		dependencyIds: ["build_outline", "analyze_data"],
		status: "planned",
	},
];

test("等待、工作量和缓冲共同推前最晚开始时间", () => {
	const decisions = new DecisionEngine().replan(
		WorkGraph.create(goal, nodes),
		profile,
		"2026-08-28T09:00:00+08:00",
	);

	assert.equal(decisions[0]?.nodeId, "request_data");
	assert.match(decisions[0]?.reason ?? "", /等待/);
	assert.equal(
		decisions.find((item) => item.nodeId === "build_outline")?.recommendedAction,
		"start",
	);
});

test("内部审核节点早于最终截止时间并写入解释", () => {
	const decisions = new DecisionEngine().replan(
		WorkGraph.create(goal, nodes),
		profile,
		"2026-09-02T09:00:00+08:00",
	);
	const outline = decisions.find((item) => item.nodeId === "build_outline");

	assert.equal(outline?.targetAt, "2026-09-02T18:00:00+08:00");
	assert.match(outline?.reason ?? "", /老板审核/);
});

test("依赖未完成的节点保持等待并说明阻塞", () => {
	const decisions = new DecisionEngine().replan(
		WorkGraph.create(goal, nodes),
		profile,
		"2026-08-28T09:00:00+08:00",
	);
	const analysis = decisions.find((item) => item.nodeId === "analyze_data");

	assert.equal(analysis?.recommendedAction, "wait");
	assert.match(analysis?.reason ?? "", /依赖/);
});

test("前置任务必须在下游任务最晚开始前完成", () => {
	const chainedGoal: WorkGoal = {
		...goal,
		milestones: [{
			id: "milestone_delivery",
			title: "完成审核版",
			at: "2026-09-02T16:00:00+08:00",
			nodeIds: ["draft", "review"],
		}],
	};
	const chainedNodes: readonly WorkNode[] = [
		{
			id: "draft",
			goalId: chainedGoal.id,
			title: "完成初稿",
			owner: "self",
			workMinutes: 180,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready",
		},
		{
			id: "review",
			goalId: chainedGoal.id,
			title: "校对审核版",
			owner: "self",
			workMinutes: 45,
			waitMinutes: 0,
			dependencyIds: ["draft"],
			status: "planned",
		},
	];

	const decisions = new DecisionEngine().replan(
		WorkGraph.create(chainedGoal, chainedNodes),
		profile,
		"2026-08-29T14:00:00+08:00",
	);

	assert.equal(decisions.find((item) => item.nodeId === "review")?.latestStart, "2026-09-02T15:06:00+08:00");
	assert.equal(decisions.find((item) => item.nodeId === "draft")?.latestStart, "2026-09-02T11:30:00+08:00");
});

test("周末创建计划时把前置工作安排到下一个工作周", () => {
	const dataGoal: WorkGoal = {
		...goal,
		milestones: [{
			id: "milestone_data",
			title: "取得数据",
			at: "2026-09-01T10:00:00+08:00",
			nodeIds: ["request", "wait"],
		}],
	};
	const dataNodes: readonly WorkNode[] = [
		{
			id: "request",
			goalId: dataGoal.id,
			title: "联系小王",
			owner: "self",
			workMinutes: 10,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready",
		},
		{
			id: "wait",
			goalId: dataGoal.id,
			title: "等待小王数据",
			owner: "小王",
			workMinutes: 0,
			waitMinutes: 480,
			dependencyIds: ["request"],
			status: "planned",
		},
	];

	const decisions = new DecisionEngine().replan(
		WorkGraph.create(dataGoal, dataNodes),
		profile,
		"2026-08-29T14:00:00+08:00",
	);

	assert.equal(decisions.find((item) => item.nodeId === "request")?.latestStart, "2026-08-31T15:48:00+08:00");
});

test("单个节点超过每日容量时明确提示容量风险", () => {
	const oversized: WorkNode = {
		id: "oversized",
		goalId: goal.id,
		title: "集中制作汇报",
		owner: "self",
		workMinutes: 600,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready",
	};
	const decision = new DecisionEngine().replan(
		WorkGraph.create({ ...goal, milestones: [] }, [oversized]),
		profile,
		"2026-08-28T09:00:00+08:00",
	)[0];

	assert.match(decision?.reason ?? "", /每日容量/);
});
