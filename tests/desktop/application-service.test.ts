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

test("读取快照时会合并后台最新的执行状态", async () => {
	let reads = 0;
	const service = new ApplicationService({
		getSnapshot: async () => {
			reads += 1;
			return {
				...emptyApplicationSnapshot(),
				executions: [{
					id: "run-1",
					title: "生成复盘初稿",
					status: "running",
					progress: "正在生成",
					updatedAt: "2026-08-29T09:00:00+08:00",
					model: "gpt-5.6-terra",
					workspaceRoots: ["/tmp/work"],
					networkEnabled: false,
					allowedTools: ["创建文件"],
					risk: "medium",
					error: null,
				}],
			};
		},
	});
	assert.equal((await service.getSnapshot()).executions[0]?.status, "running");
	assert.equal(reads, 1);
});
