import assert from "node:assert/strict";
import test from "node:test";

import { ApplicationService, emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import { channels } from "../../src/desktop/channels.js";
import { createInvokeHandler } from "../../src/desktop/ipc.js";

import { parseUiCommand } from "../../src/desktop/ipc.js";

test("渲染命令只允许白名单名称和结构化参数", async () => {
	const invokeHandler = createInvokeHandler(new ApplicationService());
	const result = await invokeHandler(channels.command, { name: "deleteEverything" });
	assert.deepEqual(result, { ok: false, error: "不支持的工作命令" });
});

test("合法文本提交通过固定频道进入应用服务", async () => {
	let text = "";
	const service = new ApplicationService({
		submitText: async (value) => {
			text = value;
			return emptyApplicationSnapshot();
		},
	});
	const invokeHandler = createInvokeHandler(service);
	const result = await invokeHandler(channels.submitText, { text: "  完成季度复盘  " });

	assert.equal(result.ok, true);
	assert.equal(text, "完成季度复盘");
});

test("手动待办通过专用频道同步到应用服务", async () => {
	let todo: { title: string; at: string } | null = null;
	const service = new ApplicationService({
		addManualTodo: async (value) => {
			todo = value;
			return emptyApplicationSnapshot();
		},
	});
	const invokeHandler = createInvokeHandler(service);
	const result = await invokeHandler(channels.addTodo, {
		title: "处理突发客诉",
		at: "2026-08-28T15:30:00+08:00",
	});

	assert.equal(result.ok, true);
	assert.deepEqual(todo, { title: "处理突发客诉", at: "2026-08-28T15:30:00+08:00" });
	assert.equal((await invokeHandler(channels.addTodo, { title: "", at: "2026-08-28T15:30:00+08:00" })).ok, false);
});

test("轻面板关闭请求只隐藏窗口而不退出应用", async () => {
	let hidden = false;
	const service = new ApplicationService({ hideMiniPanel: () => { hidden = true; } });
	const result = await createInvokeHandler(service)(channels.hideMiniPanel);

	assert.deepEqual(result, { ok: true, value: null });
	assert.equal(hidden, true);
});

test("清理数据只能通过专用桌面频道执行", async () => {
	let resets = 0;
	const service = new ApplicationService({
		resetApplicationData: async () => { resets += 1; },
	} as never);
	const result = await createInvokeHandler(service)("application:reset-data");

	assert.deepEqual(result, { ok: true, value: null });
	assert.equal(resets, 1);
	assert.equal(parseUiCommand({ name: "resetApplicationData" }).ok, false);
});

test("执行审批和成果验收命令必须携带精确标识", () => {
	assert.deepEqual(parseUiCommand({ name: "confirmProfile", goalId: "goal-1" }), {
		ok: true,
		value: { name: "confirmProfile", goalId: "goal-1" },
	});
	assert.deepEqual(parseUiCommand({
		name: "startExecution",
		goalId: "goal-1",
		nodeId: "node-1",
		allowWebResearch: true,
	}), {
		ok: true,
		value: {
			name: "startExecution",
			goalId: "goal-1",
			nodeId: "node-1",
			allowWebResearch: true,
		},
	});
	assert.equal(parseUiCommand({ name: "startExecution", goalId: "goal-1", nodeId: "node-1" }).ok, false);
	assert.deepEqual(parseUiCommand({
		name: "answerExecutionApproval",
		executionId: "run-1",
		requestId: "request-1",
		decision: "approve",
	}), {
		ok: true,
		value: {
			name: "answerExecutionApproval",
			executionId: "run-1",
			requestId: "request-1",
			decision: "approve",
		},
	});
	assert.equal(parseUiCommand({
		name: "acceptExecutionArtifact",
		executionId: "run-1",
		artifactId: "artifact-1",
		actualMinutes: 0,
	}).ok, false);
});
