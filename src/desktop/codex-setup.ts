import type { AccountState, BrowserLogin, RateLimitReadiness } from "../codex/app-server-client.js";
import { CodexAppServer } from "../codex/app-server-client.js";
import { locateCodex, type LocatedCodex } from "../codex/codex-locator.js";

export interface CodexSetupClient {
	account(refresh?: boolean): Promise<AccountState>;
	chooseModel(): Promise<string | null>;
	startChatGptLogin(): Promise<BrowserLogin>;
	rateLimits(): Promise<RateLimitReadiness>;
	close(): Promise<void>;
}

export interface CodexSetupState {
	readonly ready: boolean;
	readonly reason: string;
	readonly canStartBrowserLogin: boolean;
	readonly executable: string | null;
	readonly version: string | null;
	readonly account: string;
	readonly model: string | null;
	readonly rateLimit: string;
}

export interface CodexSetupDependencies<TClient extends CodexSetupClient = CodexSetupClient> {
	readonly locate: () => Promise<LocatedCodex | null>;
	readonly connect: (command: string) => Promise<TClient>;
	readonly openExternal: (url: string) => Promise<void>;
}

const defaultDependencies: CodexSetupDependencies = {
	locate: () => locateCodex(),
	connect: (command) => CodexAppServer.start(command),
	openExternal: async () => { throw new Error("桌面浏览器打开能力尚未配置"); },
};

const accountLabel = (account: Readonly<Record<string, unknown>>): string => {
	if (typeof account.email === "string" && account.email.trim()) return account.email.trim();
	if (typeof account.name === "string" && account.name.trim()) return account.name.trim();
	if (account.type === "apiKey") return "接口密钥账号";
	return "已登录";
};

const trustedAuthUrl = (value: string): URL => {
	let url: URL;
	try { url = new URL(value); } catch { throw new Error("登录地址无效"); }
	if (url.protocol !== "https:") throw new Error("登录地址不安全，已拒绝打开");
	const host = url.hostname.toLowerCase();
	const allowed = host === "openai.com" || host.endsWith(".openai.com")
		|| host === "chatgpt.com" || host.endsWith(".chatgpt.com");
	if (!allowed) throw new Error("登录地址不受信任，已拒绝打开");
	return url;
};

export class CodexSetup<TClient extends CodexSetupClient = CodexSetupClient> {
	readonly #dependencies: CodexSetupDependencies<TClient>;
	#located: LocatedCodex | null = null;
	#client: TClient | null = null;
	#lastState: CodexSetupState | null = null;

	constructor(dependencies: CodexSetupDependencies<TClient> = defaultDependencies as CodexSetupDependencies<TClient>) {
		this.#dependencies = dependencies;
	}

	async readiness(refresh = false): Promise<CodexSetupState> {
		if (this.#lastState && !refresh) return this.#lastState;
		try {
			if (!this.#located) this.#located = await this.#dependencies.locate();
			if (!this.#located) return this.#store(this.#unavailable("未找到本机执行代理"));
			if (!this.#client) this.#client = await this.#dependencies.connect(this.#located.command);
			const account = await this.#client.account(this.#lastState !== null);
			if (!account.account) {
				return this.#store({
					ready: false,
					reason: account.requiresOpenaiAuth ? "需要登录" : "没有可用账号",
					canStartBrowserLogin: account.requiresOpenaiAuth,
					executable: this.#located.command,
					version: this.#located.version,
					account: "未登录",
					model: null,
					rateLimit: "登录后检查",
				});
			}
			const model = await this.#client.chooseModel();
			if (!model) return this.#store({
				ready: false,
				reason: "账号没有可用模型",
				canStartBrowserLogin: false,
				executable: this.#located.command,
				version: this.#located.version,
				account: accountLabel(account.account),
				model: null,
				rateLimit: "无法检查",
			});
			let rateLimit: RateLimitReadiness = { available: null, summary: "额度状态未知" };
			try {
				rateLimit = await this.#client.rateLimits();
			} catch {
				// 额度是辅助状态，账号和模型可用时不阻断本机工作。
			}
			return this.#store({
				ready: rateLimit.available !== false,
				reason: rateLimit.available === false ? "当前额度不可用" : "已就绪",
				canStartBrowserLogin: false,
				executable: this.#located.command,
				version: this.#located.version,
				account: accountLabel(account.account),
				model,
				rateLimit: rateLimit.summary,
			});
		} catch {
			return this.#store(this.#unavailable("执行代理连接失败"));
		}
	}

	async startBrowserLogin(): Promise<void> {
		if (!this.#client) await this.readiness();
		if (!this.#client) throw new Error("执行代理不可用，无法登录");
		const login = await this.#client.startChatGptLogin();
		await this.#dependencies.openExternal(trustedAuthUrl(login.authUrl).toString());
	}

	async client(): Promise<TClient> {
		const state = this.#lastState ?? await this.readiness();
		if (!state.ready || !this.#client) throw new Error(state.reason);
		return this.#client;
	}

	async close(): Promise<void> {
		const client = this.#client;
		this.#client = null;
		this.#lastState = null;
		if (client) await client.close();
	}

	#unavailable(reason: string): CodexSetupState {
		return {
			ready: false,
			reason,
			canStartBrowserLogin: false,
			executable: this.#located?.command ?? null,
			version: this.#located?.version ?? null,
			account: "不可用",
			model: null,
			rateLimit: "无法检查",
		};
	}

	#store(state: CodexSetupState): CodexSetupState {
		this.#lastState = state;
		return state;
	}
}
