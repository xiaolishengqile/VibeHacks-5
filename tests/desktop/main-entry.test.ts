import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("桌面入口不在模块顶层等待就绪事件", async () => {
	const source = await readFile(new URL("../../src/desktop/main.ts", import.meta.url), "utf8");
	assert.doesNotMatch(source, /await\s+app\.whenReady\(\)/);
	assert.match(source, /app\.whenReady\(\)\.then\(/);
});
