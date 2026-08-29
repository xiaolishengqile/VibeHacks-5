import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { PetStatus } from "../renderer/view-models.js";

export type PetEvent =
	| { readonly type: "open_panel" }
	| { readonly type: "open_workbench" }
	| { readonly type: "open_today" }
	| { readonly type: "open_input" }
	| { readonly type: "close_today" }
	| { readonly type: "hide_pet" }
	| { readonly type: "quit_requested" }
	| { readonly type: "pet_ready" };

type PetEventListener = (event: PetEvent) => void;

const allowedEvents = new Set<PetEvent["type"]>([
	"open_panel",
	"open_workbench",
	"open_today",
	"open_input",
	"close_today",
	"hide_pet",
	"quit_requested",
	"pet_ready",
]);
const allowedStates = new Set<PetStatus>([
	"idle", "urgent", "thinking", "awaiting_approval", "executing", "completed", "failed",
]);
const maximumBodyBytes = 8 * 1024;

const respondJson = (response: ServerResponse, status: number, value: unknown): void => {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(JSON.stringify(value));
};

const isLoopbackHost = (host: string | undefined): boolean => {
	if (!host) return false;
	const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
	return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
};

const readBody = (request: IncomingMessage): Promise<{ readonly tooLarge: boolean; readonly text: string }> =>
	new Promise((resolve, reject) => {
		let size = 0;
		let tooLarge = false;
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > maximumBodyBytes) {
				tooLarge = true;
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve({ tooLarge, text: tooLarge ? "" : Buffer.concat(chunks).toString("utf8") }));
		request.on("error", reject);
	});

export class PetBridge {
	readonly port: number;
	readonly token: string;
	readonly url: string;
	readonly #server: Server;
	readonly #listeners = new Set<PetEventListener>();
	#state: PetStatus = "idle";
	#closed = false;

	private constructor(server: Server, port: number, token: string) {
		this.#server = server;
		this.port = port;
		this.token = token;
		this.url = `http://127.0.0.1:${port}`;
	}

	static async start(): Promise<PetBridge> {
		const token = randomBytes(32).toString("hex");
		let bridge: PetBridge | null = null;
		const server = createServer((request, response) => {
			if (!bridge) return respondJson(response, 503, { error: "桥接尚未就绪" });
			void bridge.#handle(request, response);
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => resolve());
		});
		const address = server.address();
		if (!address || typeof address === "string") {
			server.close();
			throw new Error("无法确定桌宠桥接端口");
		}
		bridge = new PetBridge(server, address.port, token);
		return bridge;
	}

	setState(state: PetStatus): void {
		if (!allowedStates.has(state)) throw new Error("不支持的桌宠状态");
		this.#state = state;
	}

	onEvent(listener: PetEventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	async close(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;
		this.#listeners.clear();
		await new Promise<void>((resolve, reject) => {
			this.#server.close((error) => error ? reject(error) : resolve());
		});
	}

	async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		try {
			if (!isLoopbackHost(request.headers.host)) return respondJson(response, 403, { error: "只允许本机访问" });
			if (!this.#authorized(request.headers.authorization)) return respondJson(response, 401, { error: "桌宠令牌无效" });
			const path = new URL(request.url ?? "/", this.url).pathname;
			if (request.method === "GET" && path === "/health") return respondJson(response, 200, { ok: true });
			if (request.method === "GET" && path === "/state") return respondJson(response, 200, { state: this.#state });
			if (request.method === "POST" && path === "/event") {
				const body = await readBody(request);
				if (body.tooLarge) return respondJson(response, 413, { error: "请求内容过大" });
				let input: unknown;
				try {
					input = JSON.parse(body.text);
				} catch {
					return respondJson(response, 400, { error: "事件内容无效" });
				}
				if (typeof input !== "object" || input === null) return respondJson(response, 400, { error: "事件内容无效" });
				const type = (input as Record<string, unknown>).type;
				if (typeof type !== "string" || !allowedEvents.has(type as PetEvent["type"])) {
					return respondJson(response, 400, { error: "不支持的桌宠事件" });
				}
				const event = { type } as PetEvent;
				for (const listener of this.#listeners) listener(event);
				return respondJson(response, 202, { accepted: true });
			}
			return respondJson(response, 404, { error: "找不到桌宠桥接路径" });
		} catch {
			if (!response.headersSent) respondJson(response, 500, { error: "桌宠桥接请求失败" });
		}
	}

	#authorized(header: string | undefined): boolean {
		if (!header?.startsWith("Bearer ")) return false;
		const actual = Buffer.from(header.slice(7), "utf8");
		const expected = Buffer.from(this.token, "utf8");
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	}
}
