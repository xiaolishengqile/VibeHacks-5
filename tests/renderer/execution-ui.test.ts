import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(`../../src/renderer/${name}`, import.meta.url), "utf8");

test("轻面板提供代理状态、计划确认和执行控制入口", async () => {
	const html = await read("mini.html");
	for (const id of [
		"close-mini-panel",
		"mini-more",
		"codex-status",
		"codex-login",
		"execution-primary",
		"execution-secondary",
		"approval-summary",
		"profile-summary",
		"confirm-profile",
	]) assert.match(html, new RegExp(`id="${id}"`));
	assert.doesNotMatch(html, /status-dot|voice-future|class="quick-actions"/);
	assert.match(await read("mini-panel.ts"), /startDay\.hideMiniPanel\(\)/);
});

test("完整工作台合并账号、执行、审批和成果操作区", async () => {
	const html = await read("index.html");
	for (const id of [
		"calendar-prev-week",
		"calendar-next-week",
		"readiness-summary",
		"execution-state-list",
		"codex-login",
		"codex-refresh",
		"allow-web-research",
	]) assert.match(html, new RegExp(`id="${id}"`));
	assert.doesNotMatch(html, /id="waiting-list"|id="decision-explanation"|id="execution-list"|id="approval-list"|id="artifact-list"|class="calendar-state"/);
	assert.doesNotMatch(html, /选择工作目录|工作目录/);
	assert.doesNotMatch(await read("workbench.ts"), /暂无安排/);
});

test("轻面板不要求用户选择或读取业务文件夹", async () => {
	const html = await read("mini.html");
	assert.doesNotMatch(html, /choose-directory|选择目录|工作目录|读取文件夹/);
	assert.doesNotMatch(await read("mini-panel.ts"), /chooseWorkDirectory|工作目录/);
});

test("轻面板可以响应想法入口并聚焦输入框", async () => {
	assert.match(await read("mini-panel.ts"), /startDay\.onFocusInput\(/);
});

test("执行界面仍只用安全文本节点显示代理内容", async () => {
	const source = `${await read("workbench.ts")}\n${await read("mini-panel.ts")}`;
	assert.doesNotMatch(source, /\.innerHTML\s*=/);
	assert.doesNotMatch(source, /window\.(?:prompt|confirm)\(/);
	assert.match(source, /createTextElement|setText/);
	assert.match(source, /requestSequence/);
});
