import assert from "node:assert/strict";
import test from "node:test";

import { transitionExecution } from "../../src/execution/state-machine.js";
import type { ExecutionRun, ExecutionStatus } from "../../src/execution/types.js";

const now = "2026-08-28T09:00:00+08:00";

const sampleRun = (status: ExecutionStatus): ExecutionRun => ({
	id: "run_1",
	workGoalId: "goal_1",
	workNodeId: "node_1",
	goal: "生成季度复盘文档",
	model: "gpt-5.6-terra",
	workspaceRoots: ["/workspace/review"],
	networkEnabled: false,
	allowedTools: ["读取文件", "创建文件", "运行测试"],
	risk: "medium",
	status,
	threadId: null,
	turnId: null,
	createdAt: now,
	updatedAt: now,
	startedAt: null,
	completedAt: null,
	error: null,
	version: 1,
});

test("执行必须经过规划、确认、运行和验证", () => {
	let run = sampleRun("queued");
	run = transitionExecution(run, "planning", now);
	run = transitionExecution(run, "awaitingApproval", now);
	run = transitionExecution(run, "running", now);
	run = transitionExecution(run, "verifying", now);
	run = transitionExecution(run, "succeeded", now);
	assert.equal(run.status, "succeeded");
	assert.equal(run.completedAt, now);
	assert.throws(() => transitionExecution(run, "running", now), /不允许/);
});

test("运行中的执行可以暂停并恢复", () => {
	let run = sampleRun("running");
	run = transitionExecution(run, "paused", now);
	assert.equal(transitionExecution(run, "running", now).status, "running");
});

test("所有非终态可以取消但终态不可再次迁移", () => {
	for (const status of ["queued", "planning", "awaitingApproval", "running", "verifying", "paused"] as const) {
		assert.equal(transitionExecution(sampleRun(status), "canceled", now).status, "canceled");
	}
	for (const status of ["succeeded", "failed", "canceled"] as const) {
		assert.throws(() => transitionExecution(sampleRun(status), "canceled", now), /不允许/);
	}
});

test("规划、运行和验证阶段可以记录失败", () => {
	for (const status of ["planning", "running", "verifying"] as const) {
		const failed = transitionExecution(sampleRun(status), "failed", now, "执行失败");
		assert.equal(failed.error, "执行失败");
	}
});
