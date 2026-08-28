import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ArtifactManager } from "../../src/execution/artifacts.js";

const root = mkdtempSync(join(tmpdir(), "startday-artifacts-"));
const workspace = join(root, "workspace");
const outside = join(root, "outside");
mkdirSync(workspace);
mkdirSync(outside);
test.after(() => rmSync(root, { recursive: true, force: true }));

test("成果必须位于授权目录且是非空普通文件", async () => {
	const manager = new ArtifactManager();
	const valid = join(workspace, "复盘.md");
	writeFileSync(valid, "# 季度复盘\n\n结论完整", "utf8");
	const result = await manager.verify(valid, [workspace], [{ kind: "contains", text: "结论" }]);
	assert.equal(result.verified, true);
	assert.match(result.sha256, /^[a-f0-9]{64}$/);

	const empty = join(workspace, "空文件.md");
	writeFileSync(empty, "", "utf8");
	await assert.rejects(manager.verify(empty, [workspace]), /空文件/);
	await assert.rejects(manager.verify(join(outside, "越界.md"), [workspace]), /授权目录/);
	await assert.rejects(manager.verify(workspace, [workspace]), /普通文件/);
});

test("符号链接成果不能绕过目录隔离", async () => {
	const manager = new ArtifactManager();
	const secret = join(outside, "secret.md");
	writeFileSync(secret, "不应读取", "utf8");
	const link = join(workspace, "link.md");
	symlinkSync(secret, link);
	await assert.rejects(manager.verify(link, [workspace]), /授权目录/);
});

test("内容检查失败时成果不通过验证", async () => {
	const manager = new ArtifactManager();
	const draft = join(workspace, "初稿.md");
	writeFileSync(draft, "只有标题", "utf8");
	await assert.rejects(manager.verify(draft, [workspace], [{ kind: "contains", text: "结论" }]), /缺少要求内容/);
});

test("同名成果冲突时创建递增版本副本", async () => {
	const manager = new ArtifactManager();
	const source = join(workspace, "source.md");
	const target = join(workspace, "成果.md");
	writeFileSync(source, "新成果", "utf8");
	writeFileSync(target, "旧成果", "utf8");
	writeFileSync(join(workspace, "成果 (2).md"), "第二版", "utf8");
	const copied = await manager.copyVersioned(source, target, [workspace]);
	assert.equal(copied, join(workspace, "成果 (3).md"));
	assert.equal(readFileSync(copied, "utf8"), "新成果");
	assert.equal(readFileSync(target, "utf8"), "旧成果");
});
