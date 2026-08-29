import { DatabaseSync } from "node:sqlite";

export { clearApplicationData, migrateDatabase } from "./migrations.js";

export function openDatabase(path: string): DatabaseSync {
	const database = new DatabaseSync(path);
	database.exec("PRAGMA foreign_keys = ON");
	database.exec("PRAGMA journal_mode = WAL");
	return database;
}
