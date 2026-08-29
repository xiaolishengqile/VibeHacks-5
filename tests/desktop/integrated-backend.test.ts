import assert from "node:assert/strict";
import test from "node:test";

import type { ApplicationSnapshot, UiCommand } from "../../src/desktop/application-service.js";
import { emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import {
	IntegratedDesktopBackend,
	type DesktopExecutionRuntime,
} from "../../src/desktop/integrated-backend.js";
import type { ExecutionRepository } from "../../src/execution/repositories.js";
import type { ApprovalRequest, Artifact, ExecutionEvent, ExecutionRun } from "../../src/execution/types.js";
import { basicWorkNodeDetail, type WorkDraft } from "../../src/work/types.js";

class CoreBackend {
	snapshot: ApplicationSnapshot = {
		...emptyApplicationSnapshot(),
		goal: {
			id: "goal-1", title: "季度复盘", description: "产品经理季度复盘，突出留存改进",
			deadline: "2026-09-04T18:00:00+08:00",
			milestones: [{ id: "milestone-1", title: "内部审核", at: "2026-09-03T15:00:00+08:00", nodeIds: ["node_1"] }],
			status: "active", createdAt: "2026-08-29T09:00:00+08:00", updatedAt: "2026-08-29T09:00:00+08:00",
		},
		nodes: [
			{
				id: "node_0", goalId: "goal-1", title: "收集数据", owner: "self",
				workMinutes: 60, waitMinutes: 0, dependencyIds: [], status: "ready",
			},
			{
				id: "node_1", goalId: "goal-1", title: "生成复盘框架", owner: "self",
				workMinutes: 60, waitMinutes: 0, dependencyIds: ["node_0"], status: "ready",
				fixedStart: "2026-09-02T09:00:00+08:00", latestStart: "2026-09-02T13:00:00+08:00",
				detail: basicWorkNodeDetail("生成复盘框架"),
			},
		],
		decisions: [{
			nodeId: "node_1", title: "生成复盘框架", latestStart: "2026-09-02T13:00:00+08:00",
			scheduledStart: "2026-09-02T09:00:00+08:00", scheduledEnd: "2026-09-02T10:00:00+08:00",
			scheduledSegments: [{
				scheduledStart: "2026-09-02T09:00:00+08:00", scheduledEnd: "2026-09-02T10:00:00+08:00",
			}],
			targetAt: "2026-09-03T15:00:00+08:00", recommendedAction: "start", risk: "low", reason: "测试排期",
		}],
	};
	draft: WorkDraft | null = null;
	revisedDraft: WorkDraft | null = null;
	todo: { title: string; at: string } | null = null;
	async getSnapshot() { return this.snapshot; }
	async submitText(_text: string) { return this.snapshot; }
	async createFromDraft(draft: WorkDraft) { this.draft = draft; return this.snapshot; }
	async reviseFromDraft(draft: WorkDraft) { this.revisedDraft = draft; return this.snapshot; }
	async addManualTodo(todo: { title: string; at: string }) { this.todo = todo; return this.snapshot; }
	async runCommand(_command: UiCommand) { return this.snapshot; }
}

class MemoryExecutionRepository implements ExecutionRepository {
	run: ExecutionRun | null = null;
	events: ExecutionEvent[] = [];
	approvals: ApprovalRequest[] = [];
	artifacts: Artifact[] = [];
	async saveRun(run: ExecutionRun) { this.run = run; }
	async loadRun(id: string) { return this.run?.id === id ? this.run : null; }
	async listRunsForWorkNode(id: string) { return this.run?.workNodeId === id ? [this.run] : []; }
	async appendEvent(event: ExecutionEvent) { this.events.push(event); }
	async listEvents(runId: string) { return this.events.filter((event) => event.runId === runId); }
	async saveApproval(approval: ApprovalRequest) { this.approvals.push(approval); }
	async listApprovals(runId: string) { return this.approvals.filter((approval) => approval.runId === runId); }
	async saveArtifact(artifact: Artifact) { this.artifacts.push(artifact); }
	async listArtifacts(runId: string) { return this.artifacts.filter((artifact) => artifact.runId === runId); }
}

const readyState = {
	ready: true,
	reason: "已就绪",
	canStartBrowserLogin: false,
	executable: "/app/codex",
	version: "codex-cli 0.150.1",
	account: "user@example.com",
	model: "gpt-5.6-terra",
	rateLimit: "额度可用",
} as const;

function setup(options: {
	readonly defaultWorkDirectory?: string;
	readonly failClose?: boolean;
	readonly withoutGoal?: boolean;
} = {}) {
	const core = new CoreBackend();
	if (options.withoutGoal) core.snapshot = emptyApplicationSnapshot();
	const repository = new MemoryExecutionRepository();
	const calls: string[] = [];
	const interpretations: string[] = [];
	const draft: WorkDraft = {
		title: "季度复盘",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [{
			title: "生成复盘框架", owner: "self", workMinutes: 60, waitMinutes: 0,
			dependencyIndexes: [], detail: basicWorkNodeDetail("生成复盘框架"),
		}],
		assumptions: [],
	};
	const runtime: DesktopExecutionRuntime = {
		interpreter: {
			interpret: async (_text, existingPlanContext) => {
				interpretations.push(existingPlanContext ?? "");
				return { status: "ready", draft, confidence: 0.9, questions: [] };
			},
		},
		orchestrator: {
			create: async (request) => {
				calls.push(`create:${request.workNodeId}`);
				const run: ExecutionRun = {
					id: "run-1", workGoalId: request.workGoalId, workNodeId: request.workNodeId,
					goal: request.goal, model: request.model, workspaceRoots: request.workspaceRoots,
					networkEnabled: request.networkEnabled, allowedTools: request.allowedTools, risk: request.risk,
					status: "queued", threadId: null, turnId: null,
					createdAt: "2026-08-29T09:00:00+08:00", updatedAt: "2026-08-29T09:00:00+08:00",
					startedAt: null, completedAt: null, error: null, version: 1,
				};
				await repository.saveRun(run);
				return run;
			},
			plan: async (id) => { calls.push(`plan:${id}`); return repository.run!; },
			confirmPlan: async (id) => { calls.push(`confirm:${id}`); return repository.run!; },
			answerApproval: async (_id, requestId, decision) => { calls.push(`approval:${requestId}:${decision}`); },
			cancel: async (id) => { calls.push(`cancel:${id}`); return repository.run!; },
			resume: async (id) => { calls.push(`resume:${id}`); return repository.run!; },
			acceptArtifact: async (_id, artifactId, minutes) => { calls.push(`accept:${artifactId}:${minutes}`); },
		},
		close: () => {
			calls.push("close");
			if (options.failClose) throw new Error("模拟停止失败");
		},
	};
	const setupService = {
		readiness: async () => readyState,
		startBrowserLogin: async () => { calls.push("login"); },
	};
	let publishRuntimeEvent: ((event: Parameters<Parameters<IntegratedDesktopBackend["subscribe"]>[0]>[0]) => void) | null = null;
	const backend = new IntegratedDesktopBackend({
		core,
		setup: setupService,
		executionRepository: repository,
		...(options.defaultWorkDirectory ? { defaultWorkDirectory: options.defaultWorkDirectory } : {}),
		createRuntime: async (publish) => {
			publishRuntimeEvent = publish;
			return runtime;
		},
		openArtifact: async (path) => { calls.push(`open:${path}`); },
		clock: { now: () => "2026-08-29T09:00:00+08:00" },
	});
	return {
		backend, core, repository, calls, interpretations,
		publish: (event: Parameters<Parameters<IntegratedDesktopBackend["subscribe"]>[0]>[0]) => publishRuntimeEvent?.(event),
	};
}

test("首次理解在没有现有目标时创建工作", async () => {
	const context = setup({ withoutGoal: true });
	await context.backend.submitText("下周五完成季度复盘");
	assert.equal(context.core.draft?.title, "季度复盘");
	assert.equal(context.core.revisedDraft, null);
});

test("已有计划提供完整上下文并走增量重排", async () => {
	const context = setup();
	await context.backend.submitText("下周五完成季度复盘");
	const existingPlan = context.interpretations[0] ?? "";
	assert.match(existingPlan, /"description":"产品经理季度复盘/);
	assert.match(existingPlan, /"nodeIds":\["node_1"\]/);
	assert.match(existingPlan, /"sourceNodeId":"node_1"/);
	assert.match(existingPlan, /"dependencyIds":\["node_0"\]/);
	assert.match(existingPlan, /"fixedStart":"2026-09-02T09:00:00\+08:00"/);
	assert.match(existingPlan, /"latestStart":"2026-09-02T13:00:00\+08:00"/);
	assert.match(existingPlan, /"scheduledSegments"/);
	assert.match(existingPlan, /"summary":"完成「生成复盘框架」/);
	assert.equal(context.core.draft, null);
	assert.equal(context.core.revisedDraft?.title, "季度复盘");
});

test("从工作节点创建只绑定已选择目录的执行计划", async () => {
	const context = setup();
	context.backend.setWorkDirectory("/tmp/startday-work");
	await context.backend.runCommand({
		name: "startExecution", goalId: "goal-1", nodeId: "node_1", allowWebResearch: true,
	});
	assert.deepEqual(context.calls.slice(0, 2), ["create:node_1", "plan:run-1"]);
	assert.deepEqual(context.repository.run?.workspaceRoots, ["/tmp/startday-work"]);
	assert.equal(context.repository.run?.networkEnabled, true);
	assert.ok(context.repository.run?.allowedTools.includes("公开网页调研"));
	const snapshot = await context.backend.getSnapshot();
	assert.equal(snapshot.executions[0]?.model, "gpt-5.6-terra");
	assert.equal(snapshot.codex.ready, true);
});

test("未选择目录时使用默认产物目录启动执行", async () => {
	const context = setup({ defaultWorkDirectory: "/tmp/startday-output" });
	await context.backend.runCommand({
		name: "startExecution", goalId: "goal-1", nodeId: "node_1", allowWebResearch: false,
	});

	assert.deepEqual(context.repository.run?.workspaceRoots, ["/tmp/startday-output"]);
	assert.equal(context.repository.run?.allowedTools.includes("读取文件"), false);
});

test("审批、登录、成果打开和验收通过统一命令入口", async () => {
	const context = setup();
	context.backend.setWorkDirectory("/tmp/startday-work");
	await context.backend.runCommand({
		name: "startExecution", goalId: "goal-1", nodeId: "node_1", allowWebResearch: false,
	});
	context.repository.artifacts.push({
		id: "artifact-1", runId: "run-1", workNodeId: "node_1", name: "复盘.md",
		path: "/tmp/startday-work/复盘.md", sha256: "a".repeat(64), version: 1, verified: true,
		createdAt: "2026-08-29T09:10:00+08:00",
	});
	await context.backend.runCommand({
		name: "answerExecutionApproval", executionId: "run-1", requestId: "request-1", decision: "approve",
	});
	await context.backend.runCommand({
		name: "openExecutionArtifact", executionId: "run-1", artifactId: "artifact-1",
	});
	await context.backend.runCommand({
		name: "acceptExecutionArtifact", executionId: "run-1", artifactId: "artifact-1", actualMinutes: 90,
	});
	await context.backend.runCommand({ name: "startCodexLogin" });
	assert.deepEqual(context.calls.slice(-4), [
		"approval:request-1:approve",
		"open:/tmp/startday-work/复盘.md",
		"accept:artifact-1:90",
		"login",
	]);
});

test("停止失败时保留事件订阅并允许后续重建运行时", async () => {
	const context = setup({ failClose: true });
	const received: string[] = [];
	context.backend.subscribe((event) => received.push(event.message));
	await context.backend.submitText("下周五完成季度复盘");

	await assert.rejects(context.backend.close(), /模拟停止失败/);
	context.publish({ kind: "warning", message: "停止失败但界面仍可收到通知", at: "2026-08-29T09:00:00+08:00" });
	assert.deepEqual(received, ["停止失败但界面仍可收到通知"]);

	await context.backend.submitText("重新建立执行通道");
	assert.equal(context.core.revisedDraft?.title, "季度复盘");
});

test("仅停止执行通道时保留订阅并可重建运行时", async () => {
	const context = setup();
	const received: string[] = [];
	context.backend.subscribe((event) => received.push(event.message));
	await context.backend.submitText("下周五完成季度复盘");

	await context.backend.stopExecutionRuntime();
	await context.backend.submitText("重新建立执行通道");
	context.publish({ kind: "info", message: "重建后继续刷新", at: "2026-08-29T09:00:00+08:00" });

	assert.deepEqual(received, ["重建后继续刷新"]);
	assert.equal(context.calls.filter((call) => call === "close").length, 1);
});
