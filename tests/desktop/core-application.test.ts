import assert from "node:assert/strict";
import test from "node:test";

import { FallbackWorkBackend } from "../../src/desktop/core-application.js";
import { CommandService } from "../../src/work/command-service.js";
import { DecisionEngine } from "../../src/work/decision-engine.js";
import { createProfile } from "../../src/work/profile.js";
import type { StoredWorkAggregate, WorkRepository } from "../../src/work/repositories.js";

class MemoryRepository implements WorkRepository {
	aggregate: StoredWorkAggregate | null = null;
	async loadAggregate(goalId: string) { return this.aggregate?.goal.id === goalId ? this.aggregate : null; }
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
