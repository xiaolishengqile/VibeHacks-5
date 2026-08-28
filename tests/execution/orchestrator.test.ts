import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExecutionAgentEvent, UserApprovalDecision } from "../../src/codex/execution-agent.js";
import { ArtifactManager } from "../../src/execution/artifacts.js";
import {
	ExecutionOrchestrator,
	type ExecutionAgentPort,
	type WorkExecutionPort,
} from "../../src/execution/orchestrator.js";
import type { ExecutionRepository } from "../../src/execution/repositories.js";
import type { ApprovalRequest, Artifact, ExecutionEvent, ExecutionRun } from "../../src/execution/types.js";
import type { IdGenerator } from "../../src/shared/ids.js";

const root = mkdtempSync(join(tmpdir(), "startday-orchestrator-"));
const workspace = join(root, "workspace");
const outside = join(root, "outside");
mkdirSync(workspace);
mkdirSync(outside);
test.after(() => rmSync(root, { recursive: true, force: true }));

class MemoryExecutionRepository implements ExecutionRepository {
	readonly runs = new Map<string, ExecutionRun>();
	readonly events: ExecutionEvent[] = [];
	readonly approvals = new Map<string, ApprovalRequest>();
	readonly artifacts = new Map<string, Artifact>();

	async saveRun(run: ExecutionRun): Promise<void> { this.runs.set(run.id, run); }
	async loadRun(runId: string): Promise<ExecutionRun | null> { return this.runs.get(runId) ?? null; }
	async listRunsForWorkNode(workNodeId: string): Promise<readonly ExecutionRun[]> {
		return [...this.runs.values()].filter((run) => run.workNodeId === workNodeId);
	}
	async appendEvent(event: ExecutionEvent): Promise<void> { this.events.push(event); }
	async listEvents(runId: string): Promise<readonly ExecutionEvent[]> {
		return this.events.filter((event) => event.runId === runId).sort((a, b) => a.sequence - b.sequence);
	}
	async saveApproval(approval: ApprovalRequest): Promise<void> { this.approvals.set(approval.id, approval); }
	async listApprovals(runId: string): Promise<readonly ApprovalRequest[]> {
		return [...this.approvals.values()].filter((approval) => approval.runId === runId);
	}
	async saveArtifact(artifact: Artifact): Promise<void> { this.artifacts.set(artifact.id, artifact); }
	async listArtifacts(runId: string): Promise<readonly Artifact[]> {
		return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
	}
}

class FakeAgent implements ExecutionAgentPort {
	readonly listeners = new Set<(event: ExecutionAgentEvent) => void | Promise<void>>();
	readonly approvals: Array<{ id: string; decision: UserApprovalDecision }> = [];
	readonly interrupted: string[] = [];
	readonly planned: ExecutionRun[] = [];
	readonly executed: ExecutionRun[] = [];

	onEvent(listener: (event: ExecutionAgentEvent) => void | Promise<void>): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	async plan(run: ExecutionRun): Promise<{ threadId: string; turnId: string }> {
		this.planned.push(run);
		return { threadId: `thread-${run.id}`, turnId: `plan-${run.id}` };
	}
	async execute(run: ExecutionRun): Promise<{ threadId: string; turnId: string }> {
		this.executed.push(run);
		return { threadId: run.threadId ?? `thread-${run.id}`, turnId: `execute-${run.id}-${this.executed.length}` };
	}
	async approve(requestId: string, decision: UserApprovalDecision): Promise<void> {
		this.approvals.push({ id: requestId, decision });
	}
	async interrupt(run: ExecutionRun): Promise<void> { this.interrupted.push(run.id); }
	async emit(event: ExecutionAgentEvent): Promise<void> {
		await Promise.all([...this.listeners].map((listener) => listener(event)));
	}
}

class FakeWorkExecution implements WorkExecutionPort {
	readonly states = new Map<string, "ready" | "running" | "review" | "done" | "failed">([["node-1", "ready"]]);
	actualMinutes: number | null = null;
	async start(_goalId: string, nodeId: string): Promise<void> { this.states.set(nodeId, "running"); }
	async review(_goalId: string, nodeId: string): Promise<void> { this.states.set(nodeId, "review"); }
	async fail(_goalId: string, nodeId: string): Promise<void> { this.states.set(nodeId, "failed"); }
	async accept(_goalId: string, nodeId: string, _artifactId: string, actualMinutes: number): Promise<void> {
		this.states.set(nodeId, "done");
		this.actualMinutes = actualMinutes;
	}
}

const fixedClock = { now: () => "2026-08-28T09:00:00+08:00" };

class SequenceIdGenerator implements IdGenerator {
	#value = 0;
	next(prefix: string): string { return `${prefix}-${++this.#value}`; }
}

function setup() {
	const repository = new MemoryExecutionRepository();
	const agent = new FakeAgent();
	const work = new FakeWorkExecution();
	const orchestrator = new ExecutionOrchestrator(
		repository,
		agent,
		new ArtifactManager(),
		work,
		new SequenceIdGenerator(),
		fixedClock,
	);
	return { repository, agent, work, orchestrator };
}

async function plannedExecution() {
	const context = setup();
	const run = await context.orchestrator.create({
		workGoalId: "goal-1",
		workNodeId: "node-1",
		goal: "完成季度复盘框架",
		model: "gpt-5.6-terra",
		workspaceRoots: [workspace],
		networkEnabled: false,
		allowedTools: ["读取文件", "创建文件", "运行测试"],
		risk: "medium",
	});
	await context.orchestrator.plan(run.id);
	await context.agent.emit({ type: "plan", runId: run.id, message: "读取资料并创建复盘初稿" });
	await context.agent.emit({ type: "turnCompleted", runId: run.id, message: "规划完成" });
	return { ...context, run };
}

test("成功执行只把节点推进到待验收，用户接受后才完成", async () => {
	const context = await plannedExecution();
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "awaitingApproval");
	await context.orchestrator.confirmPlan(context.run.id, {
		workspaceRoots: [workspace],
		networkEnabled: false,
		allowedTools: ["读取文件", "创建文件", "运行测试"],
		risk: "medium",
	});
	assert.equal(context.work.states.get("node-1"), "running");

	const artifactPath = join(workspace, "复盘初稿.md");
	writeFileSync(artifactPath, "# 季度复盘\n\n已有结论", "utf8");
	await context.agent.emit({
		type: "artifact", runId: context.run.id, message: "文件变更", paths: [artifactPath],
	});
	await context.agent.emit({ type: "turnCompleted", runId: context.run.id, message: "执行完成" });

	assert.equal((await context.repository.loadRun(context.run.id))?.status, "succeeded");
	assert.equal(context.work.states.get("node-1"), "review");
	const artifact = (await context.repository.listArtifacts(context.run.id))[0];
	assert.equal(artifact?.verified, true);
	await context.orchestrator.acceptArtifact(context.run.id, artifact!.id, 95);
	assert.equal(context.work.states.get("node-1"), "done");
	assert.equal(context.work.actualMinutes, 95);
});

test("成果验证失败时执行和工作节点都进入失败", async () => {
	const context = await plannedExecution();
	await context.orchestrator.confirmPlan(context.run.id, {
		workspaceRoots: [workspace], networkEnabled: false, allowedTools: ["创建文件"], risk: "medium",
	});
	const artifactPath = join(workspace, "空成果.md");
	writeFileSync(artifactPath, "", "utf8");
	await context.agent.emit({ type: "artifact", runId: context.run.id, message: "文件变更", paths: [artifactPath] });
	await context.agent.emit({ type: "turnCompleted", runId: context.run.id, message: "执行完成" });
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "failed");
	assert.equal(context.work.states.get("node-1"), "failed");
});

test("授权目录外成果被拒绝", async () => {
	const context = await plannedExecution();
	await context.orchestrator.confirmPlan(context.run.id, {
		workspaceRoots: [workspace], networkEnabled: false, allowedTools: ["创建文件"], risk: "medium",
	});
	const artifactPath = join(outside, "越界.md");
	writeFileSync(artifactPath, "越界内容", "utf8");
	await context.agent.emit({ type: "artifact", runId: context.run.id, message: "文件变更", paths: [artifactPath] });
	await context.agent.emit({ type: "turnCompleted", runId: context.run.id, message: "执行完成" });
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "failed");
});

test("审批请求先持久化，用户决定后恢复运行", async () => {
	const context = await plannedExecution();
	await context.orchestrator.confirmPlan(context.run.id, {
		workspaceRoots: [workspace], networkEnabled: false, allowedTools: ["创建文件"], risk: "medium",
	});
	await context.agent.emit({
		type: "approvalRequested",
		runId: context.run.id,
		requestId: "request-41",
		risk: "medium",
		message: "创建复盘初稿",
		sessionEligible: false,
	});
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "awaitingApproval");
	assert.equal((await context.repository.listApprovals(context.run.id))[0]?.status, "pending");
	await context.orchestrator.answerApproval(context.run.id, "request-41", "approve");
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "running");
	assert.deepEqual(context.agent.approvals, [{ id: "request-41", decision: "approve" }]);
});

test("取消会先保存终态再中断代理，暂停任务可以沿用线程恢复", async () => {
	const context = await plannedExecution();
	await context.orchestrator.confirmPlan(context.run.id, {
		workspaceRoots: [workspace], networkEnabled: false, allowedTools: ["创建文件"], risk: "medium",
	});
	await context.orchestrator.cancel(context.run.id);
	assert.equal((await context.repository.loadRun(context.run.id))?.status, "canceled");
	assert.deepEqual(context.agent.interrupted, [context.run.id]);

	const paused = await context.orchestrator.create({
		workGoalId: "goal-1", workNodeId: "node-1", goal: "恢复任务", model: "gpt-5.6-terra",
		workspaceRoots: [workspace], networkEnabled: false, allowedTools: ["创建文件"], risk: "low",
	});
	context.repository.runs.set(paused.id, {
		...paused, status: "paused", threadId: "existing-thread", turnId: "old-turn", version: 2,
	});
	await context.orchestrator.resume(paused.id);
	const resumed = await context.repository.loadRun(paused.id);
	assert.equal(resumed?.status, "running");
	assert.equal(resumed?.threadId, "existing-thread");
});
