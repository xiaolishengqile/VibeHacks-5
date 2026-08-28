import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(`../../src/renderer/${name}`, import.meta.url), "utf8");

test("轻面板提供代理状态、计划确认和执行控制入口", async () => {
	const html = await read("mini.html");
	for (const id of [
		"close-mini-panel",
		"codex-status",
		"codex-login",
		"execution-primary",
		"execution-secondary",
		"approval-summary",
		"profile-summary",
		"confirm-profile",
	]) assert.match(html, new RegExp(`id="${id}"`));
	assert.match(await read("mini-panel.ts"), /startDay\.hideMiniPanel\(\)/);
});

test("完整工作台提供账号、执行范围、审批和成果操作区", async () => {
	const html = await read("index.html");
	for (const id of [
		"codex-readiness",
		"codex-account",
		"codex-model",
		"codex-rate-limit",
		"codex-login",
		"codex-refresh",
		"allow-web-research",
	]) assert.match(html, new RegExp(`id="${id}"`));
	assert.match(html, /id="execution-list"/);
	assert.match(html, /id="approval-list"/);
	assert.match(html, /id="artifact-list"/);
});

test("执行界面仍只用安全文本节点显示代理内容", async () => {
	const source = `${await read("workbench.ts")}\n${await read("mini-panel.ts")}`;
	assert.doesNotMatch(source, /\.innerHTML\s*=/);
	assert.doesNotMatch(source, /window\.(?:prompt|confirm)\(/);
	assert.match(source, /createTextElement|setText/);
	assert.match(source, /requestSequence/);
});
