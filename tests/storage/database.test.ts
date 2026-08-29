import assert from "node:assert/strict";
import test from "node:test";

import { clearApplicationData, migrateDatabase, openDatabase } from "../../src/storage/database.js";

test("数据库迁移可重复执行并启用外键", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	migrateDatabase(database);

	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 3);
	assert.equal(database.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
	database.close();
});

test("不存在的工作节点不能写入依赖关系", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);

	assert.throws(
		() => database.prepare("INSERT INTO dependencies (node_id, dependency_id) VALUES (?, ?)").run("missing", "also_missing"),
		/FOREIGN KEY/,
	);
	database.close();
});

test("已有第一版数据库可以无损增加执行表", () => {
	const database = openDatabase(":memory:");
	database.exec(`
    CREATE TABLE profiles (id TEXT PRIMARY KEY);
		CREATE TABLE work_nodes (id TEXT PRIMARY KEY);
    PRAGMA user_version = 1;
  `);
	migrateDatabase(database);
	const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'execution_%' ORDER BY name
  `).all().map((row) => row.name);
	assert.deepEqual(tables, ["execution_events", "execution_runs"]);
	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 3);
	database.close();
});

test("已有第二版数据库可以无损增加任务详情", () => {
	const database = openDatabase(":memory:");
	database.exec(`
		CREATE TABLE work_nodes (
			id TEXT PRIMARY KEY,
			goal_id TEXT NOT NULL,
			title TEXT NOT NULL,
			owner TEXT NOT NULL,
			potential_collaborator_json TEXT,
			work_minutes INTEGER NOT NULL,
			wait_minutes INTEGER NOT NULL,
			status TEXT NOT NULL,
			latest_start TEXT,
			actual_minutes INTEGER
		);
		INSERT INTO work_nodes VALUES (
			'node-1', 'goal-1', '生成初稿', 'self', NULL, 60, 0, 'ready', NULL, NULL
		);
		PRAGMA user_version = 2;
	`);

	migrateDatabase(database);

	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 3);
	assert.equal(database.prepare("SELECT title FROM work_nodes WHERE id = 'node-1'").get()?.title, "生成初稿");
	assert.equal(database.prepare("SELECT detail_json FROM work_nodes WHERE id = 'node-1'").get()?.detail_json, null);
	database.close();
});

test("清理应用数据会清空业务和执行记录但保留数据库结构", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	database.exec(`
		INSERT INTO profiles VALUES (
			'profile-1', '{}', '{}', '{}', '{}', '{}'
		);
		INSERT INTO goals VALUES (
			'goal-1', 'profile-1', '季度复盘', '生成初稿', '2026-09-04T18:00:00+08:00',
			'active', '2026-08-29T09:00:00+08:00', '2026-08-29T09:00:00+08:00'
		);
		INSERT INTO work_nodes (
			id, goal_id, title, owner, potential_collaborator_json,
			work_minutes, wait_minutes, status, latest_start, actual_minutes
		) VALUES (
			'node-1', 'goal-1', '生成初稿', 'self', NULL, 60, 0, 'ready', NULL, NULL
		);
		INSERT INTO execution_runs VALUES (
			'run-1', 'goal-1', 'node-1', '生成初稿', 'test-model', '["/tmp/work"]', 0,
			'["创建文件"]', 'medium', 'queued', NULL, NULL,
			'2026-08-29T09:00:00+08:00', '2026-08-29T09:00:00+08:00', NULL, NULL, NULL, 1
		);
		INSERT INTO execution_events VALUES (
			'event-1', 'run-1', 1, 'progress', '已创建', '2026-08-29T09:00:00+08:00'
		);
		INSERT INTO approvals VALUES (
			'approval-1', 'run-1', 'request-1', '创建文件', 'medium', '创建复盘初稿',
			'pending', '2026-08-29T09:00:00+08:00', NULL
		);
		INSERT INTO artifacts VALUES (
			'artifact-1', 'run-1', 'node-1', '复盘初稿.md', '/tmp/work/复盘初稿.md', '', 1, 0,
			'2026-08-29T09:00:00+08:00'
		);
		INSERT INTO duration_observations VALUES (
			'profile-1', '季度复盘', 60, 75, 'node-1', '2026-08-29T09:00:00+08:00'
		);
		INSERT INTO waiting_observations VALUES (
			'profile-1', '小王', 1440, 'node-1', '2026-08-29T09:00:00+08:00'
		);
	`);

	clearApplicationData(database);

	for (const table of [
		"profiles", "goals", "work_nodes", "duration_observations", "waiting_observations",
		"execution_runs", "execution_events", "approvals", "artifacts",
	]) {
		const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
		assert.equal(row.count, 0, `${table} 应为空`);
	}
	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 3);
	database.close();
});

test("清理中途失败会完整回滚原有数据", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	database.exec(`
		INSERT INTO profiles VALUES ('profile-1', '{}', '{}', '{}', '{}', '{}');
		INSERT INTO goals VALUES (
			'goal-1', 'profile-1', '季度复盘', '生成初稿', '2026-09-04T18:00:00+08:00',
			'active', '2026-08-29T09:00:00+08:00', '2026-08-29T09:00:00+08:00'
		);
		INSERT INTO execution_runs VALUES (
			'run-1', 'goal-1', 'node-1', '生成初稿', 'test-model', '["/tmp/work"]', 0,
			'["创建文件"]', 'medium', 'queued', NULL, NULL,
			'2026-08-29T09:00:00+08:00', '2026-08-29T09:00:00+08:00', NULL, NULL, NULL, 1
		);
		CREATE TEMP TRIGGER reject_goal_delete BEFORE DELETE ON goals
		BEGIN
			SELECT RAISE(ABORT, '模拟清理失败');
		END;
	`);

	assert.throws(() => clearApplicationData(database), /模拟清理失败/);
	assert.equal(database.prepare("SELECT COUNT(*) AS count FROM profiles").get()?.count, 1);
	assert.equal(database.prepare("SELECT COUNT(*) AS count FROM goals").get()?.count, 1);
	assert.equal(database.prepare("SELECT COUNT(*) AS count FROM execution_runs").get()?.count, 1);
	database.close();
});
