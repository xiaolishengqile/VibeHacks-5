import assert from "node:assert/strict";
import test from "node:test";

import { CodexAppServer, type AppServerTransport } from "../../src/codex/app-server-client.js";

class FakeTransport implements AppServerTransport {
	readonly methods: string[] = [];
	readonly params: unknown[] = [];
	readonly responses = new Map<string, unknown>();
	readonly serverResponses: Array<{ id: number | string; result: unknown }> = [];
	closed = false;

	async request(method: string, params: unknown): Promise<unknown> {
		this.methods.push(method);
		this.params.push(params);
		return this.responses.get(method) ?? {};
	}

	async notify(method: string, params: unknown): Promise<void> {
		this.methods.push(method);
		this.params.push(params);
	}

	async respond(id: number | string, result: unknown): Promise<void> {
		this.serverResponses.push({ id, result });
	}

	async close(): Promise<void> {
		this.closed = true;
	}
}

const model = (modelName: string, isDefault = false) => ({
	id: modelName,
	model: modelName,
	displayName: modelName,
	isDefault,
});

test("连接后先初始化再查询账号并优先平衡模型", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", {
		account: { type: "chatgpt", email: "user@example.com", planType: "plus" },
		requiresOpenaiAuth: true,
	});
	transport.responses.set("model/list", {
		data: [model("gpt-5.6-sol", true), model("gpt-5.6-terra")],
		nextCursor: null,
	});

	const client = await CodexAppServer.connect(transport, "1.2.3");

	assert.deepEqual(transport.methods.slice(0, 3), ["initialize", "initialized", "account/read"]);
	assert.deepEqual(transport.params[0], {
		clientInfo: { name: "startday_desktop", title: "启动日桌宠", version: "1.2.3" },
		capabilities: null,
	});
	assert.equal((await client.account()).account?.email, "user@example.com");
	assert.equal(await client.chooseModel(), "gpt-5.6-terra");
});

test("未登录时保留可登录状态并返回浏览器授权地址", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
	transport.responses.set("account/login/start", {
		type: "chatgpt",
		loginId: "login-1",
		authUrl: "https://auth.openai.com/authorize",
	});

	const client = await CodexAppServer.connect(transport);
	const account = await client.account();
	const login = await client.startChatGptLogin();

	assert.equal(account.account, null);
	assert.equal(account.requiresOpenaiAuth, true);
	assert.deepEqual(login, {
		loginId: "login-1",
		authUrl: "https://auth.openai.com/authorize",
	});
	assert.deepEqual(transport.params.at(-1), {
		type: "chatgpt",
		useHostedLoginSuccessPage: true,
		appBrand: "chatgpt",
	});
});

test("首选模型不存在时使用服务端默认模型", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", { account: { type: "apiKey" }, requiresOpenaiAuth: false });
	transport.responses.set("model/list", {
		data: [model("gpt-5.5", true), model("gpt-5.4")],
		nextCursor: null,
	});
	const client = await CodexAppServer.connect(transport);
	assert.equal(await client.chooseModel(), "gpt-5.5");
});

test("没有可用模型时返回明确的不可用结果", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", { account: null, requiresOpenaiAuth: false });
	transport.responses.set("model/list", { data: [], nextCursor: null });
	const client = await CodexAppServer.connect(transport);
	assert.equal(await client.chooseModel(), null);
});

test("线程、回合、中断和审批都使用稳定协议方法", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", { account: { type: "chatgpt" }, requiresOpenaiAuth: true });
	transport.responses.set("thread/start", { thread: { id: "thread-1" } });
	transport.responses.set("turn/start", { turn: { id: "turn-1" } });
	transport.responses.set("turn/interrupt", {});
	const client = await CodexAppServer.connect(transport);

	assert.equal((await client.startThread({ model: "gpt-5.6-terra", cwd: "/tmp/work" })).thread.id, "thread-1");
	assert.equal((await client.startTurn({ threadId: "thread-1", input: [] })).turn.id, "turn-1");
	await client.interruptTurn("thread-1", "turn-1");
	await client.answerApproval(41, "decline");
	await client.close();

	assert.deepEqual(transport.methods.slice(-3), ["thread/start", "turn/start", "turn/interrupt"]);
	assert.deepEqual(transport.serverResponses, [{ id: 41, result: { decision: "decline" } }]);
	assert.equal(transport.closed, true);
});

test("登录响应缺少安全授权地址时拒绝继续", async () => {
	const transport = new FakeTransport();
	transport.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
	transport.responses.set("account/login/start", { type: "chatgpt", loginId: "login-1" });
	const client = await CodexAppServer.connect(transport);
	await assert.rejects(client.startChatGptLogin(), /登录地址/);
});
