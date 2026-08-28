import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PermissionPolicy, type PermissionRequest } from "../../src/execution/permission-policy.js";
import type { ExecutionRun } from "../../src/execution/types.js";

const root = mkdtempSync(join(tmpdir(), "startday-permission-"));
const workspace = join(root, "workspace");
const outside = join(root, "outside");
mkdirSync(workspace);
mkdirSync(outside);
writeFileSync(join(workspace, "notes.md"), "资料");
writeFileSync(join(workspace, "report.md"), "旧内容");
symlinkSync(outside, join(workspace, "escape"));
test.after(() => rmSync(root, { recursive: true, force: true }));

const run: ExecutionRun = {
	id: "run_1",
	workGoalId: "goal_1",
	workNodeId: "node_1",
	goal: "完成季度复盘",
	model: "gpt-5.6-terra",
	workspaceRoots: [workspace],
	networkEnabled: true,
	allowedTools: ["读取文件", "创建文件", "运行测试", "公开网页调研"],
	risk: "medium",
	status: "running",
	threadId: null,
	turnId: null,
	createdAt: "2026-08-28T09:00:00+08:00",
	updatedAt: "2026-08-28T09:00:00+08:00",
	startedAt: "2026-08-28T09:00:00+08:00",
	completedAt: null,
	error: null,
	version: 1,
};

const file = (operation: "read" | "create" | "overwrite" | "delete", path: string): PermissionRequest =>
	({ kind: "file", operation, path });
const command = (executable: string, args: readonly string[] = []): PermissionRequest =>
	({ kind: "command", executable, args });

test("工作目录外写入和删除操作第一版直接拒绝", () => {
	const policy = new PermissionPolicy();
	assert.equal(policy.evaluate(file("create", join(outside, "outside.txt")), run).kind, "deny");
	assert.equal(policy.evaluate(command("rm", ["report.md"]), run).kind, "deny");
	assert.equal(policy.evaluate(file("create", join(workspace, "draft.md")), run).kind, "confirm");
	assert.equal(policy.evaluate(file("read", join(workspace, "notes.md")), run).kind, "allow");
});

test("符号链接不能把文件访问带出工作目录", () => {
	const policy = new PermissionPolicy();
	assert.equal(policy.evaluate(file("create", join(workspace, "escape", "secret.md")), run).kind, "deny");
});

test("覆盖、移动和安装依赖需要单次确认", () => {
	const policy = new PermissionPolicy();
	const overwrite = policy.evaluate(file("overwrite", join(workspace, "report.md")), run);
	assert.deepEqual(overwrite.kind === "confirm" && overwrite.sessionEligible, false);
	assert.equal(policy.evaluate({
		kind: "file",
		operation: "move",
		path: join(workspace, "report.md"),
		destinationPath: join(workspace, "archive", "report.md"),
	}, run).kind, "confirm");
	assert.equal(policy.evaluate(command("npm", ["install", "marked"]), run).kind, "confirm");
	const workspacePatch = policy.evaluate({ kind: "workspacePatch", reason: "创建复盘初稿" }, run);
	assert.deepEqual(workspacePatch.kind === "confirm" && workspacePatch.sessionEligible, false);
});

test("测试和已声明的公开网页调研可以执行", () => {
	const policy = new PermissionPolicy();
	assert.equal(policy.evaluate(command("npm", ["test"]), run).kind, "allow");
	assert.equal(policy.evaluate({ kind: "network", purpose: "research", url: "https://example.com/docs" }, run).kind, "allow");
	assert.equal(policy.evaluate(
		{ kind: "network", purpose: "research", url: "https://example.com/docs" },
		{ ...run, networkEnabled: false },
	).kind, "deny");
});

test("对外动作、支付、权限变更和未知请求全部拒绝", () => {
	const policy = new PermissionPolicy();
	for (const action of ["sendMessage", "publish", "payment", "changePermission"] as const) {
		assert.equal(policy.evaluate({ kind: "outward", action }, run).kind, "deny");
	}
	assert.equal(policy.evaluate({ kind: "unknown", value: "任意操作" }, run).kind, "deny");
});
