import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { PetProcess, petLaunchSpec } from "../../src/desktop/pet-process.js";

class FakeChild extends EventEmitter {
	killed = false;
	kill(): boolean {
		this.killed = true;
		return true;
	}
}

test("开发模式通过环境变量向桌宠传递端口和令牌", () => {
	const launch = petLaunchSpec({ packaged: false, port: 43125, token: "secret", projectRoot: "/project" });
	assert.equal(launch.env.STARTDAY_BRIDGE_PORT, "43125");
	assert.equal(launch.env.STARTDAY_BRIDGE_TOKEN, "secret");
	assert.ok(launch.args.includes("--path"));
	assert.ok(launch.args.includes("/project"));
});

test("桌宠一分钟最多自动重启三次且主动停止后不重启", () => {
	const children: FakeChild[] = [];
	const pet = new PetProcess({
		packaged: false,
		projectRoot: "/project",
		spawnProcess: () => {
			const child = new FakeChild();
			children.push(child);
			return child;
		},
		schedule: (callback) => callback(),
		now: () => 1_000,
	});
	pet.start({ port: 43125, token: "secret" });
	for (let index = 0; index < 4; index += 1) children[index]!.emit("exit", 1, null);
	assert.equal(children.length, 4);

	pet.stop();
	children.at(-1)!.emit("exit", 0, null);
	assert.equal(children.length, 4);
});
