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

test("轻面板关闭请求只隐藏窗口而不退出应用", async () => {
	let hidden = false;
	const service = new ApplicationService({ hideMiniPanel: () => { hidden = true; } });
	const result = await createInvokeHandler(service)(channels.hideMiniPanel);

	assert.deepEqual(result, { ok: true, value: null });
	assert.equal(hidden, true);
});

test("执行审批和成果验收命令必须携带精确标识", () => {
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
