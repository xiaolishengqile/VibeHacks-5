import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { locateCodex } from "../../src/codex/codex-locator.js";

async function executable(directory: string, name: string, version = "codex-cli 0.150.1"): Promise<string> {
	const file = path.join(directory, name);
	await writeFile(file, `#!/bin/sh\nprintf '${version}\\n'\n`, "utf8");
	await chmod(file, 0o755);
	return file;
}

test("显式配置优先于本地依赖和环境路径", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "startday-codex-locator-"));
	const configured = await executable(root, "configured-codex");
	const local = await executable(root, "local-codex");
	const found = await locateCodex({
		env: { STARTDAY_CODEX_PATH: configured, PATH: root },
		localBinaryPath: local,
	});
	assert.deepEqual(found, { command: configured, version: "codex-cli 0.150.1", source: "configured" });
});

test("未显式配置时优先使用项目本地依赖", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "startday-codex-local-"));
	const local = await executable(root, "local-codex");
	const found = await locateCodex({ env: { PATH: "" }, localBinaryPath: local });
	assert.equal(found?.source, "local");
	assert.equal(found?.command, local);
});

test("本地依赖无效时回退到环境路径", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "startday-codex-path-"));
	await executable(root, "codex");
	const found = await locateCodex({
		env: { PATH: root },
		localBinaryPath: path.join(root, "missing"),
	});
	assert.equal(found?.source, "path");
	assert.equal(found?.version, "codex-cli 0.150.1");
});

test("候选程序版本检查失败时返回不可用", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "startday-codex-broken-"));
	const binDirectory = path.join(root, "bin");
	await mkdir(binDirectory);
	await executable(binDirectory, "codex", "not-codex");
	const found = await locateCodex({
		env: { STARTDAY_CODEX_PATH: path.join(root, "missing"), PATH: binDirectory },
		localBinaryPath: path.join(root, "also-missing"),
	});
	assert.equal(found, null);
});
