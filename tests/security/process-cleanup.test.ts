import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { JsonRpcTransport } from "../../src/codex/jsonrpc-transport.js";

const processExists = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

test("关闭执行代理会同时清理它启动的子进程", async () => {
	const root = await mkdtemp(join(tmpdir(), "startday-process-cleanup-"));
	const pidFile = join(root, "child.pid");
	const fixture = fileURLToPath(new URL("./fixtures/process-parent.mjs", import.meta.url));
	let childPid = 0;
	try {
		const transport = await JsonRpcTransport.start({
			command: process.execPath,
			args: [fixture, pidFile],
		});
		for (let attempt = 0; attempt < 50; attempt += 1) {
			try {
				childPid = Number(await readFile(pidFile, "utf8"));
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
		assert.ok(childPid > 0);
		await transport.close();
		for (let attempt = 0; attempt < 50 && processExists(childPid); attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.equal(processExists(childPid), false);
	} finally {
		if (childPid > 0 && processExists(childPid)) process.kill(childPid, "SIGKILL");
		await rm(root, { recursive: true, force: true });
	}
});
