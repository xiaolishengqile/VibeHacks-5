import { JsonRpcTransport } from "./jsonrpc-transport.js";
import type { JsonRpcCommand, JsonRpcId, JsonRpcNotification, JsonRpcServerRequest } from "./protocol.js";

export interface AppServerTransport {
	request(method: string, params: unknown): Promise<unknown>;
	notify(method: string, params: unknown): Promise<void>;
	respond(id: JsonRpcId, result: unknown): Promise<void>;
	onNotification?(listener: (notification: JsonRpcNotification) => void): () => void;
	onServerRequest?(listener: (request: JsonRpcServerRequest) => void | Promise<void>): () => void;
	close(): Promise<void>;
}

export interface AccountState {
	readonly account: Readonly<Record<string, unknown>> | null;
	readonly requiresOpenaiAuth: boolean;
}

export interface CodexModel {
	readonly id: string;
	readonly model: string;
	readonly displayName: string;
	readonly isDefault: boolean;
}

export interface BrowserLogin {
	readonly loginId: string;
	readonly authUrl: string;
}

export interface RateLimitReadiness {
	readonly available: boolean | null;
	readonly summary: string;
}

export interface ThreadStartResult {
	readonly thread: { readonly id: string };
	readonly [key: string]: unknown;
}

export interface TurnStartResult {
	readonly turn: { readonly id: string };
	readonly [key: string]: unknown;
}

export type ApprovalAnswer = "accept" | "acceptForSession" | "decline" | "cancel";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function parseAccount(value: unknown): AccountState {
	if (!isRecord(value)) throw new Error("执行代理返回了无效的账号状态");
	const account = value.account === null || isRecord(value.account) ? value.account : null;
	return { account, requiresOpenaiAuth: value.requiresOpenaiAuth === true };
}

function parseModels(value: unknown): { data: CodexModel[]; nextCursor: string | null } {
	if (!isRecord(value) || !Array.isArray(value.data)) throw new Error("执行代理返回了无效的模型列表");
	const data = value.data.flatMap((entry): CodexModel[] => {
		if (!isRecord(entry) || typeof entry.model !== "string") return [];
		return [{
			id: typeof entry.id === "string" ? entry.id : entry.model,
			model: entry.model,
			displayName: typeof entry.displayName === "string" ? entry.displayName : entry.model,
			isDefault: entry.isDefault === true,
		}];
	});
	return { data, nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null };
}

function parseStartResult(value: unknown, kind: "thread" | "turn"): ThreadStartResult | TurnStartResult {
	if (!isRecord(value) || !isRecord(value[kind]) || typeof value[kind].id !== "string") {
		throw new Error(`执行代理没有返回有效的${kind === "thread" ? "任务线程" : "执行回合"}`);
	}
	return value as unknown as ThreadStartResult | TurnStartResult;
}

export class CodexAppServer {
	readonly #transport: AppServerTransport;
	#account: AccountState;

	private constructor(transport: AppServerTransport, account: AccountState) {
		this.#transport = transport;
		this.#account = account;
	}

	static async start(command: string, packageVersion = "1.0.0"): Promise<CodexAppServer> {
		const transport = await JsonRpcTransport.start({
			command,
			args: ["app-server", "--stdio"],
		} satisfies JsonRpcCommand);
		try {
			return await CodexAppServer.connect(transport, packageVersion);
		} catch (error) {
			await transport.close();
			throw error;
		}
	}

	static async connect(transport: AppServerTransport, packageVersion = "1.0.0"): Promise<CodexAppServer> {
		await transport.request("initialize", {
			clientInfo: { name: "startday_desktop", title: "启动日桌宠", version: packageVersion },
			capabilities: null,
		});
		await transport.notify("initialized", {});
		const account = parseAccount(await transport.request("account/read", { refreshToken: false }));
		return new CodexAppServer(transport, account);
	}

	async account(refresh = false): Promise<AccountState> {
		if (refresh) {
			this.#account = parseAccount(await this.#transport.request("account/read", { refreshToken: true }));
		}
		return this.#account;
	}

	async startChatGptLogin(): Promise<BrowserLogin> {
		const result = await this.#transport.request("account/login/start", {
			type: "chatgpt",
			useHostedLoginSuccessPage: true,
			appBrand: "chatgpt",
		});
		if (!isRecord(result) || result.type !== "chatgpt"
			|| typeof result.loginId !== "string" || typeof result.authUrl !== "string") {
			throw new Error("执行代理没有返回有效的登录地址");
		}
		return { loginId: result.loginId, authUrl: result.authUrl };
	}

	async listModels(): Promise<readonly CodexModel[]> {
		const models: CodexModel[] = [];
		let cursor: string | null = null;
		do {
			const page = parseModels(await this.#transport.request("model/list", {
				cursor,
				includeHidden: false,
			}));
			models.push(...page.data);
			cursor = page.nextCursor;
		} while (cursor);
		return models;
	}

	async chooseModel(): Promise<string | null> {
		const models = await this.listModels();
		return models.find((entry) => entry.model === "gpt-5.6-terra")?.model
			?? models.find((entry) => entry.isDefault)?.model
			?? null;
	}

	async rateLimits(): Promise<RateLimitReadiness> {
		const result = await this.#transport.request("account/rateLimits/read", {});
		if (!isRecord(result) || !isRecord(result.rateLimits)) {
			return { available: null, summary: "额度状态未知" };
		}
		const snapshot = result.rateLimits;
		const primary = isRecord(snapshot.primary) ? snapshot.primary : null;
		const usedPercent = primary && typeof primary.usedPercent === "number" ? primary.usedPercent : null;
		const reached = snapshot.rateLimitReachedType !== null && snapshot.rateLimitReachedType !== undefined;
		if (reached || (usedPercent !== null && usedPercent >= 100)) {
			return { available: false, summary: "当前额度已用完" };
		}
		return usedPercent === null
			? { available: null, summary: "额度状态未知" }
			: { available: true, summary: `额度可用，已使用 ${Math.round(usedPercent)}%` };
	}

	async startThread(params: Readonly<Record<string, unknown>>): Promise<ThreadStartResult> {
		return parseStartResult(await this.#transport.request("thread/start", params), "thread") as ThreadStartResult;
	}

	async startTurn(params: Readonly<Record<string, unknown>>): Promise<TurnStartResult> {
		return parseStartResult(await this.#transport.request("turn/start", params), "turn") as TurnStartResult;
	}

	async interruptTurn(threadId: string, turnId: string): Promise<void> {
		await this.#transport.request("turn/interrupt", { threadId, turnId });
	}

	async answerApproval(requestId: JsonRpcId, decision: ApprovalAnswer): Promise<void> {
		await this.#transport.respond(requestId, { decision });
	}

	onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
		if (!this.#transport.onNotification) throw new Error("执行代理传输不支持流式事件");
		return this.#transport.onNotification(listener);
	}

	onServerRequest(listener: (request: JsonRpcServerRequest) => void | Promise<void>): () => void {
		if (!this.#transport.onServerRequest) throw new Error("执行代理传输不支持权限请求");
		return this.#transport.onServerRequest(listener);
	}

	async close(): Promise<void> {
		await this.#transport.close();
	}
}
