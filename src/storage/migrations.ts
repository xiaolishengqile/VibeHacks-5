import type { DatabaseSync } from "node:sqlite";

const schemaVersionOne = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  timezone_json TEXT NOT NULL,
  workday_start_json TEXT NOT NULL,
  workday_end_json TEXT NOT NULL,
  daily_capacity_json TEXT NOT NULL,
  buffer_percent_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_nodes (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  potential_collaborator_json TEXT,
  work_minutes INTEGER NOT NULL CHECK (work_minutes >= 0),
  wait_minutes INTEGER NOT NULL CHECK (wait_minutes >= 0),
  status TEXT NOT NULL,
  latest_start TEXT,
  actual_minutes INTEGER
);

CREATE TABLE IF NOT EXISTS dependencies (
  node_id TEXT NOT NULL REFERENCES work_nodes(id) ON DELETE CASCADE,
  dependency_id TEXT NOT NULL REFERENCES work_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, dependency_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestone_nodes (
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES work_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (milestone_id, node_id)
);

CREATE TABLE IF NOT EXISTS work_changes (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS duration_observations (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  actual_minutes INTEGER NOT NULL,
  source_work_node_id TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waiting_observations (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  collaborator TEXT NOT NULL,
  actual_minutes INTEGER NOT NULL,
  source_work_node_id TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS work_nodes_goal_idx ON work_nodes(goal_id);
CREATE INDEX IF NOT EXISTS work_changes_goal_idx ON work_changes(goal_id, created_at);
`;

export function migrateDatabase(database: DatabaseSync): void {
	const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
	if (row.user_version > 1) throw new Error(`数据库版本 ${row.user_version} 高于当前支持版本 1`);
	if (row.user_version === 1) return;

	database.exec("BEGIN IMMEDIATE");
	try {
		database.exec(schemaVersionOne);
		database.exec("PRAGMA user_version = 1");
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}
