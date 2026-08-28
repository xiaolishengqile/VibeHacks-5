import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ApplicationService } from "../../src/desktop/application-service.js";
import { createInvokeHandler } from "../../src/desktop/ipc.js";
import { PetBridge } from "../../src/desktop/pet-bridge.js";
import { miniPanelWindowOptions } from "../../src/desktop/windows.js";
import { PermissionPolicy } from "../../src/execution/permission-policy.js";
import type { ExecutionRun } from "../../src/execution/types.js";

const execution = (workspace: string): ExecutionRun => ({
	id: "run_security",
	workGoalId: "goal_security",
	workNodeId: "node_security",
	goal: "安全边界验证",
	model: "gpt-5.6-terra",
	workspaceRoots: [workspace],
	networkEnabled: true,
	allowedTools: ["读取文件", "创建文件", "运行测试", "公开网页调研"],
	risk: "medium",
	status: "running",
	threadId: null,
	turnId: null,
	createdAt: "2026-08-29T09:00:00+08:00",
	updatedAt: "2026-08-29T09:00:00+08:00",
	startedAt: "2026-08-29T09:00:00+08:00",
	completedAt: null,
	error: null,
	version: 1,
});

test("路径穿越和符号链接不能逃出授权目录", async () => {
	const root = await mkdtemp(join(tmpdir(), "startday-security-"));
	const workspace = join(root, "workspace");
	const outside = join(root, "outside");
	await Promise.all([mkdir(workspace), mkdir(outside)]);
	await symlink(outside, join(workspace, "escape"));
	const policy = new PermissionPolicy();
	const run = execution(workspace);
	try {
		assert.equal(policy.evaluate({ kind: "file", operation: "create", path: join(workspace, "..", "outside.txt") }, run).kind, "deny");
		assert.equal(policy.evaluate({ kind: "file", operation: "create", path: join(workspace, "escape", "outside.txt") }, run).kind, "deny");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("本机、私网、链路本地和内网 IPv6 地址全部拒绝", () => {
	const policy = new PermissionPolicy();
	const run = execution("/tmp/startday-security-workspace");
	for (const url of [
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data",
		"http://100.64.0.1/internal",
		"http://[fc00::1]/internal",
		"http://[fe80::1]/internal",
	]) {
		assert.equal(policy.evaluate({ kind: "network", purpose: "research", url }, run).kind, "deny", url);
	}
});

test("危险命令别名、对外动作和未知桌面请求默认拒绝", async () => {
	const policy = new PermissionPolicy();
	const run = execution("/tmp/startday-security-workspace");
	for (const [executable, args] of [
		["/bin/rm", ["-rf", "."]],
		["busybox", ["rm", "draft.md"]],
		["sh", ["-c", "rm draft.md"]],
		["python3", ["-c", "import os; os.unlink('draft.md')"]],
	] as const) {
		assert.equal(policy.evaluate({ kind: "command", executable, args }, run).kind, "deny");
	}
	for (const action of ["sendMessage", "publish", "payment", "changePermission"] as const) {
		assert.equal(policy.evaluate({ kind: "outward", action }, run).kind, "deny");
	}
	assert.deepEqual(await createInvokeHandler(new ApplicationService())("window:unknown"), {
		ok: false,
		error: "不支持的桌面请求",
	});
});

test("渲染窗口没有系统模块权限且桌宠桥接拒绝伪造令牌和超大请求", async () => {
	const preferences = miniPanelWindowOptions().webPreferences;
	assert.equal(preferences.nodeIntegration, false);
	assert.equal(preferences.contextIsolation, true);
	assert.equal(preferences.sandbox, true);
	const bridge = await PetBridge.start();
	try {
		const forged = await fetch(`${bridge.url}/state`, { headers: { authorization: "Bearer forged" } });
		assert.equal(forged.status, 401);
		const oversized = await fetch(`${bridge.url}/event`, {
			method: "POST",
			headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
			body: JSON.stringify({ type: "open_panel", padding: "x".repeat(9 * 1024) }),
		});
		assert.equal(oversized.status, 413);
	} finally {
		await bridge.close();
	}
});
