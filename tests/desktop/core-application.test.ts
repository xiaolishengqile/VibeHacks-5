import assert from "node:assert/strict";
import test from "node:test";

import { FallbackWorkBackend } from "../../src/desktop/core-application.js";
import { CommandService } from "../../src/work/command-service.js";
import { DecisionEngine } from "../../src/work/decision-engine.js";
import { createProfile } from "../../src/work/profile.js";
import type { StoredWorkAggregate, WorkRepository } from "../../src/work/repositories.js";
import { basicWorkNodeDetail } from "../../src/work/types.js";

class MemoryRepository implements WorkRepository {
	aggregate: StoredWorkAggregate | null = null;
	async loadAggregate(goalId: string) { return this.aggregate?.goal.id === goalId ? this.aggregate : null; }
	async loadLatestAggregate() { return this.aggregate; }
	async saveAggregate(aggregate: StoredWorkAggregate) { this.aggregate = aggregate; }
}

class Ids {
	#index = 0;
	next(prefix: string) { return `${prefix}_${++this.#index}`; }
}

test("智能服务不可用时文字仍能形成可调整的本地计划", async () => {
	const now = "2026-08-28T09:00:00+08:00";
	const service = new CommandService(new MemoryRepository(), new DecisionEngine(), new Ids(), { now: () => now });
	const profile = createProfile({
		id: "profile_1",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, now);
	const backend = new FallbackWorkBackend(service, profile, { now: () => now });

	const snapshot = await backend.submitText("完成季度复盘");
	assert.equal(snapshot.goal?.title, "完成季度复盘");
	assert.equal(snapshot.nodes[0]?.title, "完成季度复盘");
	assert.equal(snapshot.decisions.length, 1);
});

test("执行代理修改数据后基础后端会读取最新状态", async () => {
	const now = "2026-08-28T09:00:00+08:00";
	const repository = new MemoryRepository();
	const service = new CommandService(repository, new DecisionEngine(), new Ids(), { now: () => now });
	const profile = createProfile({
		id: "profile_1",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, now);
	const backend = new FallbackWorkBackend(service, profile, { now: () => now });
	const created = await backend.submitText("完成季度复盘");
	const goalId = created.goal!.id;
	const nodeId = created.nodes[0]!.id;

	await service.startExecution({ goalId, nodeId });
	await service.submitForReview({ goalId, nodeId });
	await service.acceptArtifact({ goalId, nodeId, artifactId: "artifact_1" });

	const refreshed = await backend.getSnapshot();
	assert.equal(refreshed.nodes[0]?.status, "done");
});

test("应用重启后会恢复最近一个工作计划", async () => {
	const now = "2026-08-28T09:00:00+08:00";
	const repository = new MemoryRepository();
	const profile = createProfile({
		id: "profile_1",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, now);
	const originalService = new CommandService(repository, new DecisionEngine(), new Ids(), { now: () => now });
	const original = new FallbackWorkBackend(originalService, profile, { now: () => now });
	await original.submitText("完成季度复盘");

	const restartedService = new CommandService(repository, new DecisionEngine(), new Ids(), { now: () => now });
	const restarted = new FallbackWorkBackend(restartedService, profile, { now: () => now });
	const snapshot = await restarted.getSnapshot();

	assert.equal(snapshot.goal?.title, "完成季度复盘");
	assert.equal(snapshot.nodes.length, 1);
});

test("刷新状态不会丢失尚未确认的停止影响范围", async () => {
	const now = "2026-08-28T09:00:00+08:00";
	const service = new CommandService(new MemoryRepository(), new DecisionEngine(), new Ids(), { now: () => now });
	const profile = createProfile({
		id: "profile_1",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, now);
	const backend = new FallbackWorkBackend(service, profile, { now: () => now });
	const created = await backend.submitText("完成季度复盘");
	await backend.runCommand({ name: "prepareStop", goalId: created.goal!.id, nodeId: created.nodes[0]!.id });

	assert.ok((await backend.getSnapshot()).pendingStop);
});

test("基础后端在已有计划时透传增量重排", async () => {
	const now = "2026-08-28T09:00:00+08:00";
	const repository = new MemoryRepository();
	const service = new CommandService(repository, new DecisionEngine(), new Ids(), { now: () => now });
	const profile = createProfile({
		id: "profile_1",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, now);
	const backend = new FallbackWorkBackend(service, profile, { now: () => now });
	const created = await backend.submitText("完成季度复盘");

	const revised = await backend.reviseFromDraft({
		title: "季度复盘补充事项",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [{
			title: "完成季度复盘", owner: "self", workMinutes: 45, waitMinutes: 0,
			dependencyIndexes: [], sourceNodeId: created.nodes[0]!.id, detail: basicWorkNodeDetail("完成季度复盘"),
		}],
		assumptions: ["本地计划"],
	});

	assert.equal(revised.goal?.id, created.goal?.id);
	assert.equal(revised.goal?.title, "季度复盘补充事项");
	assert.equal(revised.changes.at(-1)?.kind, "replanned");
});
