import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { JsonRpcTransport } from "../../src/codex/jsonrpc-transport.js";

const fakeServerCommand = {
	command: process.execPath,
	args: [fileURLToPath(new URL("./fixtures/fake-app-server.mjs", import.meta.url))],
};

test("传输层关联并发响应并转发服务端请求", async (context) => {
	const transport = await JsonRpcTransport.start(fakeServerCommand);
	context.after(() => transport.close());
	const serverRequest = new Promise<unknown>((resolve) => {
		transport.onServerRequest(async (request) => {
			assert.equal(request.method, "item/commandExecution/requestApproval");
			await transport.respond(request.id, { decision: "accept" });
			resolve(request.params);
		});
	});
	const [first, second, approval] = await Promise.all([
		transport.request("echo", { value: 1 }),
		transport.request("echo", { value: 2 }),
		transport.request("askApproval", {}),
	]);
	assert.deepEqual([first, second], [{ value: 1 }, { value: 2 }]);
	assert.deepEqual(await serverRequest, { command: "npm test" });
	assert.deepEqual(approval, { decision: { decision: "accept" } });
});

test("传输层转发通知并能从坏消息恢复", async (context) => {
	const transport = await JsonRpcTransport.start(fakeServerCommand);
	context.after(() => transport.close());
	const notification = new Promise<unknown>((resolve) => {
		transport.onNotification((value) => resolve(value));
	});
	await transport.notify("push", {});
	assert.deepEqual(await notification, { method: "turn/started", params: { turnId: "turn_1" } });
	assert.deepEqual(await transport.request("malformed", {}), { recovered: true });
	assert.match(transport.diagnostics().join("\n"), /无法解析/);
});

test("服务端错误、进程退出和请求超时会明确失败", async (context) => {
	const failed = await JsonRpcTransport.start(fakeServerCommand);
	context.after(() => failed.close());
	await assert.rejects(() => failed.request("fail", {}), /模拟失败/);
	await failed.close();

	const timedOut = await JsonRpcTransport.start(fakeServerCommand, { requestTimeoutMs: 40 });
	context.after(() => timedOut.close());
	await assert.rejects(() => timedOut.request("never", {}), /超时/);
	await timedOut.close();

	const exited = await JsonRpcTransport.start(fakeServerCommand);
	context.after(() => exited.close());
	await assert.rejects(() => exited.request("exit", {}), /退出/);
	await exited.close();
});

test("诊断输出有界且不会保留密钥", async (context) => {
	const transport = await JsonRpcTransport.start(fakeServerCommand);
	context.after(() => transport.close());
	await transport.request("diagnostic", {});
	await new Promise((resolve) => setTimeout(resolve, 10));
	const diagnostics = transport.diagnostics().join("\n");
	assert.doesNotMatch(diagnostics, /sk-test-secret-value|private-token/);
	assert.match(diagnostics, /已隐藏/);
});
