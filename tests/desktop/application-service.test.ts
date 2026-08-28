import assert from "node:assert/strict";
import test from "node:test";

import { ApplicationService, emptyApplicationSnapshot } from "../../src/desktop/application-service.js";

test("空白工作描述不会进入业务处理", async () => {
	let submitted = false;
	const service = new ApplicationService({
		submitText: async () => {
			submitted = true;
			return emptyApplicationSnapshot();
		},
	});

	await assert.rejects(() => service.submitWorkText("  \n"), /不能为空/);
	assert.equal(submitted, false);
});

test("工作目录只能来自系统选择结果", async () => {
	const service = new ApplicationService({
		chooseDirectory: async () => ["/Users/demo/季度复盘"],
	});

	assert.equal(await service.chooseWorkDirectory(), "/Users/demo/季度复盘");
	assert.equal((await service.getSnapshot()).workDirectory, "/Users/demo/季度复盘");
});

test("订阅事件只保留用户可见字段", () => {
	const service = new ApplicationService();
	const received: unknown[] = [];
	service.subscribe((event) => received.push(event));

	service.publishEvent({
		kind: "progress",
		message: "正在整理工作计划",
		at: "2026-08-28T09:00:00+08:00",
		stdout: "不应暴露的原始输出",
	});

	assert.deepEqual(received, [{
		kind: "progress",
		message: "正在整理工作计划",
		at: "2026-08-28T09:00:00+08:00",
	}]);
});
