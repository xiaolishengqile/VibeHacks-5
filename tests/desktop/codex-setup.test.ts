import assert from "node:assert/strict";
import test from "node:test";

import {
	CodexSetup,
	type CodexSetupClient,
	type CodexSetupDependencies,
} from "../../src/desktop/codex-setup.js";

class FakeClient implements CodexSetupClient {
	accountState: Awaited<ReturnType<CodexSetupClient["account"]>> = {
		account: null,
		requiresOpenaiAuth: true,
	};
	model: string | null = "gpt-5.6-terra";
	loginUrl = "https://auth.openai.com/authorize";
	closed = false;
	rateLimitError: Error | null = null;

	async account() { return this.accountState; }
	async chooseModel() { return this.model; }
	async startChatGptLogin() { return { loginId: "login-1", authUrl: this.loginUrl }; }
	async rateLimits() {
		if (this.rateLimitError) throw this.rateLimitError;
		return { available: true, summary: "额度可用" };
	}
	async close() { this.closed = true; }
}

function setup(client: FakeClient) {
	const opened: string[] = [];
	const dependencies: CodexSetupDependencies = {
		locate: async () => ({ command: "/app/codex", version: "codex-cli 0.150.1", source: "local" }),
		connect: async () => client,
		openExternal: async (url) => { opened.push(url); },
	};
	return { setup: new CodexSetup(dependencies), opened };
}

test("未登录时返回可操作的账号设置状态", async () => {
	const client = new FakeClient();
	const context = setup(client);
	assert.deepEqual(await context.setup.readiness(), {
		ready: false,
		reason: "需要登录",
		canStartBrowserLogin: true,
		executable: "/app/codex",
		version: "codex-cli 0.150.1",
		account: "未登录",
		model: null,
		rateLimit: "登录后检查",
	});
});

test("登录后显示账号、模型和额度状态", async () => {
	const client = new FakeClient();
	client.accountState = {
		account: { type: "chatgpt", email: "user@example.com", planType: "plus" },
		requiresOpenaiAuth: true,
	};
	const context = setup(client);
	const state = await context.setup.readiness();
	assert.equal(state.ready, true);
	assert.equal(state.account, "user@example.com");
	assert.equal(state.model, "gpt-5.6-terra");
	assert.equal(state.rateLimit, "额度可用");
	assert.equal(await context.setup.client(), client);
});

test("额度接口暂时失败时仍允许使用已登录且有模型的代理", async () => {
	const client = new FakeClient();
	client.accountState = {
		account: { type: "chatgpt", email: "user@example.com" },
		requiresOpenaiAuth: true,
	};
	client.rateLimitError = new Error("额度接口不可用");
	const state = await setup(client).setup.readiness();
	assert.equal(state.ready, true);
	assert.equal(state.reason, "已就绪");
	assert.equal(state.rateLimit, "额度状态未知");
});

test("两个窗口并发检查时只建立一个代理连接", async () => {
	const client = new FakeClient();
	client.accountState = {
		account: { type: "chatgpt", email: "user@example.com" },
		requiresOpenaiAuth: true,
	};
	let connections = 0;
	const service = new CodexSetup({
		locate: async () => ({ command: "/app/codex", version: "codex-cli 0.150.1", source: "local" }),
		connect: async () => { connections += 1; return client; },
		openExternal: async () => undefined,
	});
	const [first, second] = await Promise.all([service.readiness(), service.readiness()]);
	assert.equal(first.ready, true);
	assert.equal(second.ready, true);
	assert.equal(connections, 1);
});

test("浏览器登录只打开服务端返回的可信安全地址", async () => {
	const client = new FakeClient();
	const context = setup(client);
	await context.setup.startBrowserLogin();
	assert.deepEqual(context.opened, ["https://auth.openai.com/authorize"]);

	client.loginUrl = "http://auth.openai.com/authorize";
	await assert.rejects(context.setup.startBrowserLogin(), /不安全/);
	client.loginUrl = "https://evil.example.com/authorize";
	await assert.rejects(context.setup.startBrowserLogin(), /不受信任/);
});

test("找不到程序或模型时返回明确原因", async () => {
	const missing = new CodexSetup({
		locate: async () => null,
		connect: async () => { throw new Error("不应连接"); },
		openExternal: async () => undefined,
	});
	assert.equal((await missing.readiness()).reason, "未找到本机执行代理");

	const client = new FakeClient();
	client.accountState = { account: { type: "apiKey" }, requiresOpenaiAuth: false };
	client.model = null;
	assert.equal((await setup(client).setup.readiness()).reason, "账号没有可用模型");
});

test("关闭设置服务会关闭已建立的代理连接", async () => {
	const client = new FakeClient();
	const context = setup(client);
	await context.setup.readiness();
	await context.setup.close();
	assert.equal(client.closed, true);
});
