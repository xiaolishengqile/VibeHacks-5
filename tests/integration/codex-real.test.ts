import assert from "node:assert/strict";
import test from "node:test";

import { runRealSandboxFixture } from "./real-codex-fixture.js";

test("真实代理只能在临时目录创建验收文件", {
	skip: process.env.STARTDAY_REAL_CODEX_TEST !== "1",
	timeout: 240_000,
}, async () => {
	const result = await runRealSandboxFixture();
	assert.deepEqual(result.outsideWorkspaceChanges, []);
	assert.equal(result.createdArtifactVerified, true);
});
