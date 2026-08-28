import assert from "node:assert/strict";
import test from "node:test";

import { WorkGraph } from "../../src/work/graph.js";
import type { WorkGoal, WorkNode, WorkNodeStatus } from "../../src/work/types.js";

const goal: WorkGoal = {
	id: "goal_1",
	title: "季度复盘",
	description: "",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [],
	status: "active",
	createdAt: "2026-08-28T09:00:00+08:00",
	updatedAt: "2026-08-28T09:00:00+08:00",
};

const node = (
	id: string,
	dependencyIds: readonly string[] = [],
	status: WorkNodeStatus = "planned",
): WorkNode => ({
	id,
	goalId: goal.id,
	title: id,
	owner: "self",
	workMinutes: 60,
	waitMinutes: 0,
	dependencyIds,
	status,
});

test("工作图拒绝循环依赖", () => {
	assert.throws(
		() => WorkGraph.create(goal, [node("a", ["b"]), node("b", ["a"])]),
		/循环依赖/,
	);
});

test("工作图按拓扑顺序返回停止任务影响的下游节点", () => {
	const graph = WorkGraph.create(goal, [
		node("request_data"),
		node("analyze_data", ["request_data"]),
		node("build_deck", ["analyze_data"]),
	]);

	assert.deepEqual(graph.descendantsOf("request_data"), ["analyze_data", "build_deck"]);
});

test("工作节点只允许规定的状态迁移", () => {
	let graph = WorkGraph.create(goal, [node("outline")]);
	for (const status of ["ready", "running", "review", "done"] as const) {
		graph = graph.transitionNode("outline", status);
	}
	assert.equal(graph.node("outline").status, "done");
	assert.throws(() => graph.transitionNode("outline", "running"), /不允许从已完成变更为执行中/);

	const waiting = WorkGraph.create(goal, [node("request_data", [], "ready")]).transitionNode(
		"request_data",
		"waiting",
	);
	assert.equal(waiting.node("request_data").status, "waiting");
});

test("更换负责人和停止节点返回新工作图而不修改原图", () => {
	const graph = WorkGraph.create(goal, [node("request_data", [], "ready"), node("analysis", ["request_data"])]);
	const changed = graph.changeOwner("request_data", "小赵").stopNodes(["request_data", "analysis"]);

	assert.equal(graph.node("request_data").owner, "self");
	assert.equal(changed.node("request_data").owner, "小赵");
	assert.equal(changed.node("analysis").status, "stopped");
});
