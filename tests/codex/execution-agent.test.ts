import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	CodexExecutionAgent,
	type ExecutionAgentAppServer,
	type ExecutionAgentEvent,
} from "../../src/codex/execution-agent.js";
import type { JsonRpcNotification, JsonRpcServerRequest } from "../../src/codex/protocol.js";
import { PermissionPolicy } from "../../src/execution/permission-policy.js";
import type { ExecutionRun } from "../../src/execution/types.js";

const root = mkdtempSync(join(tmpdir(), "startday-execution-agent-"));
const workspace = join(root, "workspace");
const outside = join(root, "outside");
mkdirSync(workspace);
mkdirSync(outside);
test.after(() => rmSync(root, { recursive: true, force: true }));

const run: ExecutionRun = {
	id: "run-1",
	workGoalId: "goal-1",
	workNodeId: "node-1",
	goal: "完成季度复盘框架",
	model: "gpt-5.6-terra",
	workspaceRoots: [workspace],
	networkEnabled: false,
	allowedTools: ["读取文件", "创建文件", "运行测试"],
	risk: "medium",
	status: "running",
	threadId: "thread-1",
	turnId: null,
	createdAt: "2026-08-28T09:00:00+08:00",
	updatedAt: "2026-08-28T09:00:00+08:00",
	startedAt: "2026-08-28T09:00:00+08:00",
	completedAt: null,
	error: null,
	version: 1,
};

class FakeAppServer implements ExecutionAgentAppServer {
	readonly threadCalls: Array<Record<string, unknown>> = [];
	readonly turnCalls: Array<Record<string, unknown>> = [];
	readonly responses: Array<{ id: number | string; decision: string }> = [];
	readonly interrupts: Array<{ threadId: string; turnId: string }> = [];
	readonly #notificationListeners = new Set<(notification: JsonRpcNotification) => void>();
	readonly #requestListeners = new Set<(request: JsonRpcServerRequest) => void | Promise<void>>();

	async startThread(params: Readonly<Record<string, unknown>>): Promise<{ thread: { id: string } }> {
		this.threadCalls.push({ ...params });
		return { thread: { id: `thread-${this.threadCalls.length}` } };
	}

	async startTurn(params: Readonly<Record<string, unknown>>): Promise<{ turn: { id: string } }> {
		this.turnCalls.push({ ...params });
		return { turn: { id: `turn-${this.turnCalls.length}` } };
	}

	async interruptTurn(threadId: string, turnId: string): Promise<void> {
		this.interrupts.push({ threadId, turnId });
	}

	async answerApproval(id: number | string, decision: "accept" | "acceptForSession" | "decline" | "cancel"): Promise<void> {
		this.responses.push({ id, decision });
	}

	onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
		this.#notificationListeners.add(listener);
		return () => this.#notificationListeners.delete(listener);
	}

	onServerRequest(listener: (request: JsonRpcServerRequest) => void | Promise<void>): () => void {
		this.#requestListeners.add(listener);
		return () => this.#requestListeners.delete(listener);
	}

	emit(method: string, params: unknown): void {
		for (const listener of this.#notificationListeners) listener({ method, params });
	}

	async request(id: number | string, method: string, params: unknown): Promise<void> {
		await Promise.all([...this.#requestListeners].map((listener) => listener({ id, method, params })));
	}
}

const nextEvent = (agent: CodexExecutionAgent): Promise<ExecutionAgentEvent> =>
	new Promise((resolve) => {
		const unsubscribe = agent.onEvent((event) => {
			unsubscribe();
			resolve(event);
		});
	});

test("执行回合锁定用户目录、网络和中等推理强度", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	const ids = await agent.execute(run);
	assert.deepEqual(ids, { threadId: "thread-1", turnId: "turn-1" });
	assert.deepEqual(server.turnCalls[0], {
		threadId: "thread-1",
		input: [{ type: "text", text: "完成季度复盘框架", text_elements: [] }],
		cwd: workspace,
		approvalPolicy: "on-request",
		sandboxPolicy: {
			type: "workspaceWrite",
			writableRoots: [workspace],
			networkAccess: false,
			excludeTmpdirEnvVar: true,
			excludeSlashTmp: true,
		},
		model: "gpt-5.6-terra",
		effort: "medium",
	});
	agent.close();
});

test("目录外文件修改被产品权限策略立即拒绝", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	await agent.execute(run);
	const eventPromise = nextEvent(agent);
	await server.request(41, "item/fileChange/requestApproval", {
		threadId: "thread-1",
		turnId: "turn-1",
		changes: [{ path: join(outside, "outside.md"), kind: { type: "add" } }],
	});
	assert.equal((await eventPromise).type, "approvalDenied");
	assert.deepEqual(server.responses, [{ id: 41, decision: "decline" }]);
	agent.close();
});

test("目录内创建文件等待用户确认后才批准", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	await agent.execute(run);
	const eventPromise = nextEvent(agent);
	await server.request("approval-2", "item/fileChange/requestApproval", {
		threadId: "thread-1",
		turnId: "turn-1",
		changes: [{ path: join(workspace, "draft.md"), kind: { type: "add" } }],
	});
	const event = await eventPromise;
	assert.equal(event.type, "approvalRequested");
	assert.equal(server.responses.length, 0);
	await agent.approve("approval-2", "approve");
	assert.deepEqual(server.responses, [{ id: "approval-2", decision: "accept" }]);
	agent.close();
});

test("标准文件补丁请求即使不含路径也必须单次确认", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	await agent.execute(run);
	const eventPromise = nextEvent(agent);
	await server.request("approval-patch", "item/fileChange/requestApproval", {
		threadId: "thread-1",
		turnId: "turn-1",
		itemId: "file-change-1",
		reason: "创建复盘初稿",
		grantRoot: null,
	});
	const event = await eventPromise;
	assert.equal(event.type, "approvalRequested");
	assert.equal(event.type === "approvalRequested" && event.sessionEligible, false);
	await assert.rejects(agent.approve("approval-patch", "approveForSession"), /不能/);
	await agent.approve("approval-patch", "approve");
	assert.deepEqual(server.responses, [{ id: "approval-patch", decision: "accept" }]);
	agent.close();
});

test("已声明的测试命令自动放行且未知命令拒绝", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	await agent.execute(run);
	await server.request(3, "item/commandExecution/requestApproval", {
		threadId: "thread-1", turnId: "turn-1", command: "npm test",
	});
	await server.request(4, "item/commandExecution/requestApproval", {
		threadId: "thread-1", turnId: "turn-1", command: "curl https://example.com",
	});
	assert.deepEqual(server.responses, [
		{ id: 3, decision: "accept" },
		{ id: 4, decision: "decline" },
	]);
	agent.close();
});

test("规划只读并转发流式计划和权威终态", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	const planned = await agent.plan({ ...run, threadId: null, status: "planning" });
	assert.deepEqual(planned, { threadId: "thread-1", turnId: "turn-1" });
	assert.equal(server.threadCalls[0]?.sandbox, "read-only");
	assert.equal(server.turnCalls[0]?.effort, "medium");

	const planEvent = nextEvent(agent);
	server.emit("item/plan/delta", {
		threadId: "thread-1", turnId: "turn-1", itemId: "plan-1", delta: "读取资料并生成框架",
	});
	assert.equal((await planEvent).type, "plan");

	const completedEvent = nextEvent(agent);
	server.emit("turn/completed", {
		threadId: "thread-1", turn: { id: "turn-1", status: "completed", error: null },
	});
	assert.equal((await completedEvent).type, "turnCompleted");
	await agent.interrupt({ ...run, turnId: "turn-1" });
	assert.deepEqual(server.interrupts, [{ threadId: "thread-1", turnId: "turn-1" }]);
	agent.close();
});

test("执行事件先等待状态处理完成再通知后续订阅者", async () => {
	const server = new FakeAppServer();
	const agent = new CodexExecutionAgent(server, new PermissionPolicy());
	const order: string[] = [];
	agent.onEvent(async () => {
		await Promise.resolve();
		order.push("状态已保存");
	});
	agent.onEvent(() => { order.push("界面已通知"); });
	await agent.execute(run);
	server.emit("item/plan/delta", {
		threadId: "thread-1", turnId: "turn-1", itemId: "plan-1", delta: "执行计划",
	});
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(order, ["状态已保存", "界面已通知"]);
	agent.close();
});
