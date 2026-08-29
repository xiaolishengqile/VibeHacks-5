import assert from "node:assert/strict";
import test from "node:test";

import { CommandService } from "../../src/work/command-service.js";
import { DecisionEngine } from "../../src/work/decision-engine.js";
import { createProfile } from "../../src/work/profile.js";
import type { StoredWorkAggregate, WorkRepository } from "../../src/work/repositories.js";
import { basicWorkNodeDetail, type WorkGoal, type WorkNode } from "../../src/work/types.js";

class MemoryRepository implements WorkRepository {
	aggregate: StoredWorkAggregate | null;

	constructor(aggregate: StoredWorkAggregate | null) {
		this.aggregate = aggregate;
	}

	async loadAggregate(goalId: string): Promise<StoredWorkAggregate | null> {
		return this.aggregate?.goal.id === goalId ? structuredClone(this.aggregate) : null;
	}

	async loadLatestAggregate(): Promise<StoredWorkAggregate | null> {
		return this.aggregate ? structuredClone(this.aggregate) : null;
	}

	async saveAggregate(aggregate: StoredWorkAggregate): Promise<void> {
		this.aggregate = structuredClone(aggregate);
	}
}

class SequenceIds {
	#index = 0;
	next(prefix: string): string {
		this.#index += 1;
		return `${prefix}_${this.#index}`;
	}
}

class MutableClock {
	value = "2026-08-28T09:00:00+08:00";
	now(): string {
		return this.value;
	}
}

const profile = createProfile(
	{
		id: "profile_1",
		timezone: "Asia/Shanghai",
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
	milestones: [],
	status: "active",
	createdAt: "2026-08-28T09:00:00+08:00",
	updatedAt: "2026-08-28T09:00:00+08:00",
};

const nodes: readonly WorkNode[] = [
	{
		id: "request_data",
		goalId: goal.id,
		title: "找协作方拿数据",
		owner: "小王",
		workMinutes: 5,
		waitMinutes: 1440,
		dependencyIds: [],
		status: "ready",
	},
	{
		id: "analysis",
		goalId: goal.id,
		title: "完成数据分析",
		owner: "self",
		workMinutes: 180,
		waitMinutes: 0,
		dependencyIds: ["request_data"],
		status: "planned",
	},
];

const setup = () => {
	const repository = new MemoryRepository({ profile, goal, nodes, changes: [] });
	const clock = new MutableClock();
	const service = new CommandService(repository, new DecisionEngine(), new SequenceIds(), clock);
	return { repository, clock, service };
};

test("确认草稿后创建可排期的工作聚合", async () => {
	const repository = new MemoryRepository(null);
	const service = new CommandService(repository, new DecisionEngine(), new SequenceIds(), new MutableClock());
	const result = await service.createFromDraft({
		profile,
		draft: {
			title: "季度复盘",
			deadline: "2026-09-04T18:00:00+08:00",
			milestones: [{ title: "老板审核", at: "2026-09-02T18:00:00+08:00", nodeIndexes: [1] }],
			nodes: [
				{
					title: "找小王拿数据", owner: "小王", workMinutes: 5, waitMinutes: 1440,
					dependencyIndexes: [], detail: basicWorkNodeDetail("找小王拿数据"),
				},
				{
					title: "搭建框架", owner: "self", workMinutes: 180, waitMinutes: 0,
					dependencyIndexes: [0], detail: basicWorkNodeDetail("搭建框架"),
				},
			],
			assumptions: [],
		},
	});

	assert.equal(result.aggregate.graph.nodes.length, 2);
	assert.equal(result.aggregate.graph.goal.milestones[0]?.nodeIds[0], result.aggregate.graph.nodes[1]?.id);
	assert.equal(result.aggregate.graph.node(result.aggregate.graph.nodes[0]!.id).status, "ready");
	assert.match(result.aggregate.graph.nodes[0]?.detail?.summary ?? "", /找小王拿数据/);
});

test("首次案例建立的工作模型经用户确认后才生成行动建议", async () => {
	const repository = new MemoryRepository(null);
	const service = new CommandService(repository, new DecisionEngine(), new SequenceIds(), new MutableClock());
	const inferredProfile = createProfile({
		id: "profile_first_use",
		timezone: "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
		source: "inferred",
	}, "2026-08-28T09:00:00+08:00");
	const created = await service.createFromDraft({
		profile: inferredProfile,
		draft: {
			title: "季度复盘",
			deadline: "2026-09-04T18:00:00+08:00",
			milestones: [],
			nodes: [{
				title: "搭建框架", owner: "self", workMinutes: 180, waitMinutes: 0,
				dependencyIndexes: [], detail: basicWorkNodeDetail("搭建框架"),
			}],
			assumptions: [],
		},
	});
	assert.deepEqual(created.decisions, []);
	assert.equal(created.aggregate.profile.dailyCapacityMinutes.confirmed, false);

	const confirmed = await service.confirmProfile({ goalId: created.aggregate.graph.goal.id });
	assert.equal(confirmed.aggregate.profile.dailyCapacityMinutes.confirmed, true);
	assert.equal(confirmed.aggregate.profile.bufferPercent.confirmed, true);
	assert.equal(confirmed.decisions.length, 1);
	assert.equal(confirmed.change.kind, "profileConfirmed");
});

test("更换协作方后保存历史并重新计算当前行动", async () => {
	const { service } = setup();
	const result = await service.changeOwner({ goalId: "goal_1", nodeId: "request_data", owner: "小赵" });

	assert.equal(result.aggregate.graph.node("request_data").owner, "小赵");
	assert.equal(result.change.reason, "协作方由小王变更为小赵");
	assert.ok(result.decisions.length > 0);
});

test("修改截止时间后更新目标并重新排期", async () => {
	const { service } = setup();
	const result = await service.changeDeadline({
		goalId: "goal_1",
		deadline: "2026-09-03T18:00:00+08:00",
	});

	assert.equal(result.aggregate.graph.goal.deadline, "2026-09-03T18:00:00+08:00");
	assert.match(result.change.reason, /9月4日.*9月3日|2026-09-04.*2026-09-03/);
});

test("修改里程碑时间后重新排期", async () => {
	const milestoneGoal: WorkGoal = {
		...goal,
		milestones: [{ id: "review", title: "老板审核", at: "2026-09-02T18:00:00+08:00", nodeIds: ["analysis"] }],
	};
	const repository = new MemoryRepository({ profile, goal: milestoneGoal, nodes, changes: [] });
	const service = new CommandService(repository, new DecisionEngine(), new SequenceIds(), new MutableClock());
	const result = await service.changeMilestone({
		goalId: "goal_1",
		milestoneId: "review",
		at: "2026-09-01T18:00:00+08:00",
	});

	assert.equal(result.aggregate.graph.goal.milestones[0]?.at, "2026-09-01T18:00:00+08:00");
	assert.match(result.change.reason, /老板审核/);
});

test("手动待办会追加到当前目标并用指定时间进入日历", async () => {
	const { service } = setup();
	const result = await service.addManualTodo({
		profile,
		goalId: "goal_1",
		title: "处理突发客诉",
		at: "2026-08-28T15:30:00+08:00",
	});

	const todo = result.aggregate.graph.nodes.find((node) => node.title === "处理突发客诉");
	assert.ok(todo);
	assert.equal(todo.status, "ready");
	assert.equal(todo.latestStart, "2026-08-28T15:30:00+08:00");
	assert.match(todo.detail?.summary ?? "", /处理突发客诉/);
	assert.equal(result.aggregate.graph.goal.milestones.at(-1)?.nodeIds[0], todo.id);
	assert.equal(result.decisions.find((decision) => decision.nodeId === todo.id)?.latestStart, "2026-08-28T15:30:00+08:00");
	assert.equal(result.change.kind, "todoAdded");
});

test("手动待办不能安排在周末", async () => {
	const { service } = setup();

	await assert.rejects(
		() => service.addManualTodo({
			profile,
			goalId: "goal_1",
			title: "周末整理材料",
			at: "2026-08-29T10:00:00+08:00",
		}),
		/周六周日不安排工作/,
	);
});

test("停止任务必须确认全部受影响节点且令牌只能使用一次", async () => {
	const { service } = setup();
	const prepared = await service.prepareStop({ goalId: "goal_1", nodeId: "request_data" });
	assert.deepEqual(prepared.affectedNodeIds, ["request_data", "analysis"]);

	const result = await service.confirmStop({ goalId: "goal_1", token: prepared.token });
	assert.equal(result.aggregate.graph.node("analysis").status, "stopped");
	await assert.rejects(() => service.confirmStop({ goalId: "goal_1", token: prepared.token }), /确认已失效/);
});

test("过期停止确认不会修改任务", async () => {
	const { service, clock } = setup();
	const prepared = await service.prepareStop({ goalId: "goal_1", nodeId: "request_data" });
	clock.value = "2026-08-28T09:06:00+08:00";

	await assert.rejects(() => service.confirmStop({ goalId: "goal_1", token: prepared.token }), /确认已失效/);
});

test("记录实际耗时会更新节点和个人工作模型", async () => {
	const { service } = setup();
	const result = await service.recordActualDuration({
		goalId: "goal_1",
		nodeId: "analysis",
		actualMinutes: 240,
	});

	assert.equal(result.aggregate.graph.node("analysis").actualMinutes, 240);
	assert.equal(result.aggregate.profile.durationObservations[0]?.actualMinutes, 240);
});

test("接受成果后当前节点完成并解锁下一个工作节点", async () => {
	const repository = new MemoryRepository({
		profile,
		goal,
		nodes: [{ ...nodes[0]!, status: "review" }, nodes[1]!],
		changes: [],
	});
	const service = new CommandService(repository, new DecisionEngine(), new SequenceIds(), new MutableClock());
	const result = await service.acceptArtifact({ goalId: "goal_1", nodeId: "request_data", artifactId: "artifact_1" });

	assert.equal(result.aggregate.graph.node("request_data").status, "done");
	assert.equal(result.aggregate.graph.node("analysis").status, "ready");
	assert.match(result.change.reason, /artifact_1/);
});

test("执行节点依次进入运行、待验收和完成", async () => {
	const { service } = setup();
	const running = await service.startExecution({ goalId: "goal_1", nodeId: "request_data" });
	assert.equal(running.aggregate.graph.node("request_data").status, "running");
	const review = await service.submitForReview({ goalId: "goal_1", nodeId: "request_data" });
	assert.equal(review.aggregate.graph.node("request_data").status, "review");
});

test("执行失败会同步工作节点状态和原因", async () => {
	const { service } = setup();
	await service.startExecution({ goalId: "goal_1", nodeId: "request_data" });
	const failed = await service.failExecution({ goalId: "goal_1", nodeId: "request_data", reason: "成果为空" });
	assert.equal(failed.aggregate.graph.node("request_data").status, "failed");
	assert.match(failed.change.reason, /成果为空/);
});
