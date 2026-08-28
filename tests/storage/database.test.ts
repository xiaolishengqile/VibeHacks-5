import assert from "node:assert/strict";
import test from "node:test";

import { migrateDatabase, openDatabase } from "../../src/storage/database.js";

test("数据库迁移可重复执行并启用外键", () => {
	const database = openDatabase(":memory:");
	migrateDatabase(database);
	migrateDatabase(database);

	assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 1);
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
