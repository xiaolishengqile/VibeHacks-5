import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";

import { PetBridge, type PetEvent } from "../../src/desktop/pet-bridge.js";

const oncePetEvent = (bridge: PetBridge): Promise<PetEvent> => new Promise((resolve) => {
	const unsubscribe = bridge.onEvent((event) => {
		unsubscribe();
		resolve(event);
	});
});

const requestWithHost = (bridge: PetBridge, host: string): Promise<number> => new Promise((resolve, reject) => {
	const outgoing = request(bridge.url + "/health", {
		headers: { authorization: `Bearer ${bridge.token}`, host },
	}, (response) => {
		response.resume();
		resolve(response.statusCode ?? 0);
	});
	outgoing.on("error", reject);
	outgoing.end();
});

test("桌宠桥接拒绝错误令牌并接受打开轻面板事件", async () => {
	const bridge = await PetBridge.start();
	try {
		assert.equal((await fetch(`${bridge.url}/state`)).status, 401);
		const received = oncePetEvent(bridge);
		const response = await fetch(`${bridge.url}/event`, {
			method: "POST",
			headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
			body: JSON.stringify({ type: "open_panel" }),
		});
		assert.equal(response.status, 202);
		assert.deepEqual(await received, { type: "open_panel" });
	} finally {
		await bridge.close();
	}
});

test("桌宠桥接接受入口事件", async () => {
	const bridge = await PetBridge.start();
	try {
		for (const type of ["open_workbench", "open_today", "open_input", "close_today", "hide_pet"] as const) {
			const received = oncePetEvent(bridge);
			const response = await fetch(`${bridge.url}/event`, {
				method: "POST",
				headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
				body: JSON.stringify({ type }),
			});
			assert.equal(response.status, 202);
			assert.deepEqual(await received, { type });
		}
	} finally {
		await bridge.close();
	}
});

test("桌宠桥接只接受本机主机名和八千字节内的请求", async () => {
	const bridge = await PetBridge.start();
	try {
		assert.equal(await requestWithHost(bridge, "evil.example"), 403);
		const response = await fetch(`${bridge.url}/event`, {
			method: "POST",
			headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
			body: JSON.stringify({ type: "pet_ready", padding: "x".repeat(9 * 1024) }),
		});
		assert.equal(response.status, 413);
	} finally {
		await bridge.close();
	}
});

test("桌宠状态只返回规定值", async () => {
	const bridge = await PetBridge.start();
	try {
		bridge.setState("executing");
		const response = await fetch(`${bridge.url}/state`, {
			headers: { authorization: `Bearer ${bridge.token}` },
		});
		assert.deepEqual(await response.json(), { state: "executing" });
	} finally {
		await bridge.close();
	}
});
