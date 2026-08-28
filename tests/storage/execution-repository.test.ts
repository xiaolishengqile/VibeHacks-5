import assert from "node:assert/strict";
import test from "node:test";

import { migrateDatabase, openDatabase } from "../../src/storage/database.js";
import { SqliteExecutionRepository } from "../../src/storage/execution-repository.js";
import type { ApprovalRequest, Artifact, ExecutionEvent, ExecutionRun } from "../../src/execution/types.js";

const now = "2026-08-28T09:00:00+08:00";

const run: ExecutionRun = {
	id: "run-1",
	workGoalId: "goal-1",
	workNodeId: "node-1",
	goal: "完成季度复盘框架",
	model: "gpt-5.6-terra",
	workspaceRoots: ["/tmp/workspace"],
	networkEnabled: false,
	allowedTools: ["读取文件", "创建文件"],
	risk: "medium",
	status: "running",
	threadId: "thread-1",
	turnId: "turn-1",
	createdAt: now,
	updatedAt: now,
	startedAt: now,
	completedAt: null,
	error: null,
	version: 2,
};

test("执行仓储完整往返保存任务、事件、审批和成果", async () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	const repository = new SqliteExecutionRepository(database);
	const event: ExecutionEvent = {
		id: "event-1", runId: run.id, sequence: 1, kind: "progress", message: "正在生成", at: now,
	};
	const approval: ApprovalRequest = {
		id: "approval-1",
		runId: run.id,
		serverRequestId: "41",
		actionKind: "文件修改",
		risk: "medium",
		summary: "创建初稿",
		status: "pending",
		requestedAt: now,
		resolvedAt: null,
	};
	const artifact: Artifact = {
		id: "artifact-1",
		runId: run.id,
		workNodeId: run.workNodeId,
		name: "复盘.md",
		path: "/tmp/workspace/复盘.md",
		sha256: "a".repeat(64),
		version: 1,
		verified: true,
		createdAt: now,
	};

	await repository.saveRun(run);
	await repository.appendEvent(event);
	await repository.saveApproval(approval);
	await repository.saveArtifact(artifact);

	assert.deepEqual(await repository.loadRun(run.id), run);
	assert.deepEqual(await repository.listRunsForWorkNode(run.workNodeId), [run]);
	assert.deepEqual(await repository.listEvents(run.id), [event]);
	assert.deepEqual(await repository.listApprovals(run.id), [approval]);
	assert.deepEqual(await repository.listArtifacts(run.id), [artifact]);
	database.close();
});

test("执行记录和审批可以按版本更新且事件序号不能重复", async () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	const repository = new SqliteExecutionRepository(database);
	await repository.saveRun(run);
	await repository.saveRun({ ...run, status: "verifying", version: 3, updatedAt: "2026-08-28T09:10:00+08:00" });
	assert.equal((await repository.loadRun(run.id))?.status, "verifying");
	await assert.rejects(repository.saveRun({ ...run, version: 1 }), /版本/);

	const first: ExecutionEvent = {
		id: "event-1", runId: run.id, sequence: 1, kind: "progress", message: "开始", at: now,
	};
	await repository.appendEvent(first);
	await assert.rejects(repository.appendEvent({ ...first, id: "event-2" }), /序号/);
	database.close();
});
