import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("桌面入口不在模块顶层等待就绪事件", async () => {
	const source = await readFile(new URL("../../src/desktop/main.ts", import.meta.url), "utf8");
	assert.doesNotMatch(source, /await\s+app\.whenReady\(\)/);
	assert.match(source, /app\.whenReady\(\)\.then\(/);
});

test("桌面通信注册完成后才加载页面", async () => {
	const source = await readFile(new URL("../../src/desktop/main.ts", import.meta.url), "utf8");
	const start = source.indexOf("const startDesktop");
	const body = source.slice(start);
	assert.ok(body.indexOf("closeIpc = registerDesktopIpc") < body.indexOf("\n\tcreateWindows();"));
});
