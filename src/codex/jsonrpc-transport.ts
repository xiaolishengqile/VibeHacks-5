import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import type {
	JsonRpcCommand,
	JsonRpcError,
	JsonRpcId,
	JsonRpcMessage,
	JsonRpcNotification,
	JsonRpcServerRequest,
} from "./protocol.js";

interface TransportOptions {
	readonly requestTimeoutMs?: number;
	readonly diagnosticLineLimit?: number;
}

interface PendingRequest {
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

type NotificationListener = (notification: JsonRpcNotification) => void;
type ServerRequestListener = (request: JsonRpcServerRequest) => void | Promise<void>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export function redactSecrets(value: string): string {
	return value
		.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[已隐藏]")
		.replace(/(Bearer\s+)[^\s]+/gi, "$1[已隐藏]")
		.replace(/((?:OPENAI_)?API_KEY\s*=\s*)[^\s]+/gi, "$1[已隐藏]");
}

export class JsonRpcTransport {
	readonly #child: ChildProcessWithoutNullStreams;
	readonly #requestTimeoutMs: number;
	readonly #diagnosticLineLimit: number;
	readonly #pending = new Map<number, PendingRequest>();
	readonly #notifications = new Set<NotificationListener>();
	readonly #serverRequests = new Set<ServerRequestListener>();
	readonly #diagnosticLines: string[] = [];
	readonly #exitPromise: Promise<void>;
	#resolveExit!: () => void;
	#nextId = 1;
	#closed = false;
	#exited = false;

	private constructor(child: ChildProcessWithoutNullStreams, options: TransportOptions) {
		this.#child = child;
		this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
		this.#diagnosticLineLimit = options.diagnosticLineLimit ?? 50;
		this.#exitPromise = new Promise((resolve) => { this.#resolveExit = resolve; });
		readline.createInterface({ input: child.stdout }).on("line", (line) => this.#receive(line));
		readline.createInterface({ input: child.stderr }).on("line", (line) => this.#diagnose(line));
		child.once("exit", (code, signal) => this.#handleExit(code, signal));
	}

	static async start(command: JsonRpcCommand, options: TransportOptions = {}): Promise<JsonRpcTransport> {
		const child = spawn(command.command, command.args, {
			stdio: ["pipe", "pipe", "pipe"],
			...(command.cwd ? { cwd: command.cwd } : {}),
			env: command.env ?? process.env,
		});
		const transport = new JsonRpcTransport(child, options);
		await new Promise<void>((resolve, reject) => {
			child.once("spawn", resolve);
			child.once("error", reject);
		});
		return transport;
	}

	request(method: string, params: unknown): Promise<unknown> {
		if (this.#closed || this.#exited) return Promise.reject(new Error("执行代理传输已关闭"));
		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`执行代理请求超时：${method}`));
			}, this.#requestTimeoutMs);
			this.#pending.set(id, { resolve, reject, timer });
			void this.#write({ id, method, params }).catch((error: unknown) => {
				const pending = this.#pending.get(id);
				if (!pending) return;
				clearTimeout(pending.timer);
				this.#pending.delete(id);
				pending.reject(error instanceof Error ? error : new Error("执行代理请求写入失败"));
			});
		});
	}

	async notify(method: string, params: unknown): Promise<void> {
		await this.#write({ method, params });
	}

	async respond(id: JsonRpcId, result: unknown): Promise<void> {
		await this.#write({ id, result });
	}

	onNotification(listener: NotificationListener): () => void {
		this.#notifications.add(listener);
		return () => this.#notifications.delete(listener);
	}

	onServerRequest(listener: ServerRequestListener): () => void {
		this.#serverRequests.add(listener);
		return () => this.#serverRequests.delete(listener);
	}

	diagnostics(): readonly string[] {
		return [...this.#diagnosticLines];
	}

	async close(): Promise<void> {
		if (this.#closed && this.#exited) return;
		this.#closed = true;
		this.#rejectPending(new Error("执行代理传输已关闭"));
		this.#child.stdin.end();
		if (!this.#exited) this.#child.kill("SIGTERM");
		await this.#exitPromise;
	}

	async #write(message: JsonRpcMessage): Promise<void> {
		if (this.#closed || this.#exited || !this.#child.stdin.writable) throw new Error("执行代理传输已关闭");
		await new Promise<void>((resolve, reject) => {
			this.#child.stdin.write(`${JSON.stringify(message)}\n`, (error) => error ? reject(error) : resolve());
		});
	}

	#receive(line: string): void {
		if (!line.trim()) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			this.#diagnose(`无法解析执行代理消息：${line}`);
			return;
		}
		if (!isRecord(parsed)) {
			this.#diagnose("执行代理返回了非对象消息");
			return;
		}
		const hasId = typeof parsed.id === "number" || typeof parsed.id === "string";
		if (hasId && (Object.hasOwn(parsed, "result") || Object.hasOwn(parsed, "error"))) {
			this.#resolveResponse(parsed.id as JsonRpcId, parsed.result, parsed.error);
			return;
		}
		if (typeof parsed.method !== "string") {
			this.#diagnose("执行代理消息缺少方法名");
			return;
		}
		const params = parsed.params ?? {};
		if (hasId) {
			const request = { id: parsed.id as JsonRpcId, method: parsed.method, params };
			for (const listener of this.#serverRequests) {
				Promise.resolve(listener(request)).catch((error: unknown) => this.#diagnose(
					`处理执行代理请求失败：${error instanceof Error ? error.message : String(error)}`,
				));
			}
			return;
		}
		const notification = { method: parsed.method, params };
		for (const listener of this.#notifications) listener(notification);
	}

	#resolveResponse(id: JsonRpcId, result: unknown, error: unknown): void {
		if (typeof id !== "number") return this.#diagnose(`收到未知服务端响应：${id}`);
		const pending = this.#pending.get(id);
		if (!pending) return this.#diagnose(`收到无对应请求的响应：${id}`);
		clearTimeout(pending.timer);
		this.#pending.delete(id);
		if (isRecord(error)) {
			const rpcError = error as unknown as JsonRpcError;
			pending.reject(new Error(typeof rpcError.message === "string" ? rpcError.message : "执行代理请求失败"));
		} else {
			pending.resolve(result);
		}
	}

	#handleExit(code: number | null, signal: NodeJS.Signals | null): void {
		this.#exited = true;
		this.#closed = true;
		this.#rejectPending(new Error(`执行代理进程退出：${code ?? signal ?? "未知原因"}`));
		this.#resolveExit();
	}

	#rejectPending(error: Error): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.#pending.clear();
	}

	#diagnose(line: string): void {
		this.#diagnosticLines.push(redactSecrets(line).slice(0, 2_000));
		while (this.#diagnosticLines.length > this.#diagnosticLineLimit) this.#diagnosticLines.shift();
	}
}
