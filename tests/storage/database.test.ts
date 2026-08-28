import assert from "node:assert/strict";
import test from "node:test";

import { migrateDatabase, openDatabase } from "../../src/storage/database.js";

test("数据库迁移可重复执行并启用外键", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	migrateDatabase(database);

	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 2);
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
    PRAGMA user_version = 1;
  `);
	migrateDatabase(database);
	const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'execution_%' ORDER BY name
  `).all().map((row) => row.name);
	assert.deepEqual(tables, ["execution_events", "execution_runs"]);
	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 2);
	database.close();
});
