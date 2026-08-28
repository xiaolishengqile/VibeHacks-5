import assert from "node:assert/strict";
import test from "node:test";

import { ApplicationService, emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import { channels } from "../../src/desktop/channels.js";
import { createInvokeHandler } from "../../src/desktop/ipc.js";

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
