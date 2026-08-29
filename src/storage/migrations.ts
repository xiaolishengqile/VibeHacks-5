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

const schemaVersionTwo = `
CREATE TABLE IF NOT EXISTS execution_runs (
  id TEXT PRIMARY KEY,
  work_goal_id TEXT NOT NULL,
  work_node_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  model TEXT NOT NULL,
  workspace_roots_json TEXT NOT NULL,
  network_enabled INTEGER NOT NULL CHECK (network_enabled IN (0, 1)),
  allowed_tools_json TEXT NOT NULL,
  risk TEXT NOT NULL,
  status TEXT NOT NULL,
  thread_id TEXT,
  turn_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  version INTEGER NOT NULL CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS execution_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  server_request_id TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  risk TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (run_id, server_request_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  work_node_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, path)
);

CREATE INDEX IF NOT EXISTS execution_runs_node_idx ON execution_runs(work_node_id, created_at);
CREATE INDEX IF NOT EXISTS execution_events_run_idx ON execution_events(run_id, sequence);
CREATE INDEX IF NOT EXISTS approvals_run_idx ON approvals(run_id, requested_at);
CREATE INDEX IF NOT EXISTS artifacts_run_idx ON artifacts(run_id, created_at);
`;

export function migrateDatabase(database: DatabaseSync): void {
	const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
	if (row.user_version > 2) throw new Error(`数据库版本 ${row.user_version} 高于当前支持版本 2`);
	if (row.user_version === 2) return;

	database.exec("BEGIN IMMEDIATE");
	try {
		if (row.user_version < 1) database.exec(schemaVersionOne);
		if (row.user_version < 2) database.exec(schemaVersionTwo);
		database.exec("PRAGMA user_version = 2");
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}

export function clearApplicationData(database: DatabaseSync): void {
	database.exec("BEGIN IMMEDIATE");
	try {
		// 先清理独立执行记录，再按外键关系清理工作数据；数据库结构与版本保持不变。
		database.exec(`
			DELETE FROM execution_runs;
			DELETE FROM duration_observations;
			DELETE FROM waiting_observations;
			DELETE FROM goals;
			DELETE FROM profiles;
		`);
		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	}
}
