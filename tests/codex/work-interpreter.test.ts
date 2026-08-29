import assert from "node:assert/strict";
import test from "node:test";

import { CodexWorkInterpreter, type WorkInterpretationAppServer } from "../../src/codex/work-interpreter.js";
import type { JsonRpcNotification } from "../../src/codex/protocol.js";
import { createProfile } from "../../src/work/profile.js";

const profile = createProfile({
	timezone: "Asia/Shanghai",
	dailyCapacityMinutes: 420,
	bufferPercent: 20,
}, "2026-08-28T09:00:00+08:00");

class FakeAppServer implements WorkInterpretationAppServer {
	readonly threadCalls: Array<Record<string, unknown>> = [];
	readonly turnCalls: Array<Record<string, unknown>> = [];
	readonly #listeners = new Set<(notification: JsonRpcNotification) => void>();
	readonly #outputs: string[];
	model: string | null = "gpt-5.6-terra";

	constructor(...outputs: string[]) {
		this.#outputs = outputs;
	}

	async chooseModel(): Promise<string | null> {
		return this.model;
	}

	async startThread(params: Readonly<Record<string, unknown>>): Promise<{ thread: { id: string } }> {
		this.threadCalls.push({ ...params });
		return { thread: { id: "thread-1" } };
	}

	async startTurn(params: Readonly<Record<string, unknown>>): Promise<{ turn: { id: string } }> {
		this.turnCalls.push({ ...params });
		const turnId = `turn-${this.turnCalls.length}`;
		const output = this.#outputs.shift() ?? "{}";
		queueMicrotask(() => {
			this.#emit("item/completed", {
				threadId: "thread-1",
				turnId,
				item: { type: "agentMessage", id: `message-${turnId}`, text: output },
			});
			this.#emit("turn/completed", {
				threadId: "thread-1",
				turn: { id: turnId, status: "completed", items: [] },
			});
		});
		return { turn: { id: turnId } };
	}

	onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#emit(method: string, params: unknown): void {
		for (const listener of this.#listeners) listener({ method, params });
	}
}

const assistantDetail = {
	summary: "先完成内容，再处理呈现",
	steps: ["整理事实和数据", "形成可审阅初稿"],
	deliverables: ["可审阅初稿"],
	successCriteria: ["结论有数据支撑且结构完整"],
	suggestions: ["先写完整叙事文稿，再制作演示页面", "缺失数据先用占位和待补标记，不空等协作方"],
	contingencies: [{
		risk: "协作数据延期",
		trigger: "周三中午仍未收到数据",
		action: "使用已有数据和定性结论完成初稿并标记待补",
	}],
};

const validDraft = JSON.stringify({
	title: "季度复盘",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [{ title: "内部审核", at: "2026-09-03T15:00:00+08:00", nodeIndexes: [0] }],
	nodes: [
		{ title: "收集数据", owner: "我", workMinutes: 120, waitMinutes: 0, dependencyIndexes: [], detail: assistantDetail },
		{ title: "请小王核对数据", owner: "小王", workMinutes: 30, waitMinutes: 240, dependencyIndexes: [0], detail: assistantDetail },
	],
	assumptions: ["小王在工作日内回复"],
	confidence: 0.86,
	blockingQuestion: null,
});

test("工作理解返回结构化草稿并保留关键假设", async () => {
	const server = new FakeAppServer(validDraft);
	const interpreter = new CodexWorkInterpreter(server, "/tmp/startday-readonly");
	const interpretation = await interpreter.interpret(
		"下周五完成季度复盘，先收集数据，再请小王核对，周四内部审核。",
		profile,
	);

	assert.equal(interpretation.status, "ready");
	assert.equal(interpretation.draft?.title, "季度复盘");
	assert.equal(interpretation.draft?.nodes.some((node) => node.owner === "小王"), true);
	assert.deepEqual(interpretation.draft?.nodes[0]?.detail.suggestions, [
		"先写完整叙事文稿，再制作演示页面",
		"缺失数据先用占位和待补标记，不空等协作方",
	]);
	assert.deepEqual(interpretation.questions, []);
	assert.equal(interpretation.confidence, 0.86);
	assert.deepEqual(server.threadCalls[0], {
		model: "gpt-5.6-terra",
		cwd: "/tmp/startday-readonly",
		approvalPolicy: "never",
		sandbox: "read-only",
		ephemeral: true,
	});
	assert.equal(server.turnCalls[0]?.effort, "low");
	assert.deepEqual(server.turnCalls[0]?.sandboxPolicy, { type: "readOnly", networkAccess: false });
	assert.equal(typeof server.turnCalls[0]?.outputSchema, "object");
	assert.match(JSON.stringify(server.turnCalls[0]?.outputSchema), /"detail"/);
	const input = server.turnCalls[0]?.input as Array<{ text: string }>;
	assert.match(input[0]?.text ?? "", /不得计算最晚开始时间/);
	assert.match(input[0]?.text ?? "", /不得修改任何工作记录/);
	assert.match(input[0]?.text ?? "", /当前时间：\d{4}-\d{2}-\d{2}T/);
	assert.match(input[0]?.text ?? "", /周六、周日不安排工作/);
	assert.match(input[0]?.text ?? "", /演示文稿.*先写.*叙事/);
	assert.match(input[0]?.text ?? "", /原样保留已有有效详情/);
	assert.match(input[0]?.text ?? "", /风险.*触发条件.*兜底/);
});

test("重新安排时把现有安排交给理解器并要求不遗漏", async () => {
	const server = new FakeAppServer(validDraft);
	const interpreter = new CodexWorkInterpreter(server, "/tmp/startday-readonly");
	await interpreter.interpret("突发客诉现在要先处理，请重新安排", profile, "现有安排：季度复盘，节点：收集数据");

	const input = server.turnCalls[0]?.input as Array<{ text: string }>;
	assert.match(input[0]?.text ?? "", /现有安排：季度复盘/);
	assert.match(input[0]?.text ?? "", /重新安排/);
	assert.match(input[0]?.text ?? "", /不得遗漏/);
});

test("缺少截止时间时只返回一个关键问题", async () => {
	const server = new FakeAppServer(JSON.stringify({
		title: "整理复盘",
		deadline: null,
		milestones: [],
		nodes: [{ title: "整理材料", owner: "我", workMinutes: 60, waitMinutes: 0, dependencyIndexes: [] }],
		assumptions: [],
		confidence: 0.62,
		blockingQuestion: "这项工作最晚需要在什么时间完成？",
	}));
	const result = await new CodexWorkInterpreter(server, "/tmp/startday-readonly").interpret("整理复盘", profile);
	assert.equal(result.status, "needsInput");
	assert.equal(result.draft, null);
	assert.deepEqual(result.questions, ["这项工作最晚需要在什么时间完成？"]);
});

test("结构化结果无效时只重试一次", async () => {
	const server = new FakeAppServer("不是有效数据", validDraft);
	const result = await new CodexWorkInterpreter(server, "/tmp/startday-readonly").interpret("季度复盘", profile);
	assert.equal(result.status, "ready");
	assert.equal(server.turnCalls.length, 2);
	const retryInput = server.turnCalls[1]?.input as Array<{ text: string }>;
	assert.match(retryInput[0]?.text ?? "", /上一次结果格式无效/);
});

test("连续两次无效结果返回中文错误", async () => {
	const server = new FakeAppServer("错误一", "错误二");
	const result = await new CodexWorkInterpreter(server, "/tmp/startday-readonly").interpret("季度复盘", profile);
	assert.equal(result.status, "failed");
	assert.match(result.error ?? "", /无法生成有效的工作草稿/);
	assert.equal(server.turnCalls.length, 2);
});

test("没有可用模型时不启动任务线程", async () => {
	const server = new FakeAppServer(validDraft);
	server.model = null;
	const result = await new CodexWorkInterpreter(server, "/tmp/startday-readonly").interpret("季度复盘", profile);
	assert.equal(result.status, "failed");
	assert.match(result.error ?? "", /没有可用模型/);
	assert.equal(server.threadCalls.length, 0);
});
