import assert from "node:assert/strict";
import test from "node:test";

import { runApplicationReset } from "../../src/desktop/reset-application-data.js";

test("后台停止失败时仍关闭代理但不清库也不重启", async () => {
	const calls: string[] = [];
	await assert.rejects(runApplicationReset({
		closeBackend: async () => {
			calls.push("停止后台");
			throw new Error("停止失败");
		},
		closeCodex: async () => { calls.push("关闭代理"); },
		clearData: () => { calls.push("清理数据"); },
		relaunch: () => { calls.push("重新启动"); },
		quit: () => { calls.push("退出"); },
	}), /停止失败/);
	assert.deepEqual(calls, ["停止后台", "关闭代理"]);
});

test("后台与代理全部停止后才清库并重新启动", async () => {
	const calls: string[] = [];
	await runApplicationReset({
		closeBackend: async () => { calls.push("停止后台"); },
		closeCodex: async () => { calls.push("关闭代理"); },
		clearData: () => { calls.push("清理数据"); },
		relaunch: () => { calls.push("重新启动"); },
		quit: () => { calls.push("退出"); },
	});
	assert.deepEqual(calls, ["停止后台", "关闭代理", "清理数据", "重新启动", "退出"]);
});

test("代理关闭失败时不清库也不重启", async () => {
	const calls: string[] = [];
	await assert.rejects(runApplicationReset({
		closeBackend: async () => { calls.push("停止后台"); },
		closeCodex: async () => {
			calls.push("关闭代理");
			throw new Error("代理关闭失败");
		},
		clearData: () => { calls.push("清理数据"); },
		relaunch: () => { calls.push("重新启动"); },
		quit: () => { calls.push("退出"); },
	}), /代理关闭失败/);
	assert.deepEqual(calls, ["停止后台", "关闭代理"]);
});
