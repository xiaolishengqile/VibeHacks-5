import type { DatabaseSync } from "node:sqlite";

import type { ExecutionRepository } from "../execution/repositories.js";
import type {
	ApprovalRequest,
	ApprovalStatus,
	Artifact,
	ExecutionEvent,
	ExecutionEventKind,
	ExecutionRisk,
	ExecutionRun,
	ExecutionStatus,
} from "../execution/types.js";

type Row = Record<string, string | number | null>;

const parseList = (value: string | number | null | undefined): readonly string[] => {
	if (value === undefined || value === null) throw new Error("执行记录缺少列表数据");
	const parsed: unknown = JSON.parse(String(value));
	if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
		throw new Error("执行记录包含无效列表数据");
	}
	return parsed;
};

const mapRun = (row: Row): ExecutionRun => ({
	id: String(row.id),
	workGoalId: String(row.work_goal_id),
	workNodeId: String(row.work_node_id),
	goal: String(row.goal),
	model: String(row.model),
	workspaceRoots: parseList(row.workspace_roots_json),
	networkEnabled: Number(row.network_enabled) === 1,
	allowedTools: parseList(row.allowed_tools_json),
	risk: String(row.risk) as ExecutionRisk,
	status: String(row.status) as ExecutionStatus,
	threadId: row.thread_id === null ? null : String(row.thread_id),
	turnId: row.turn_id === null ? null : String(row.turn_id),
	createdAt: String(row.created_at),
	updatedAt: String(row.updated_at),
	startedAt: row.started_at === null ? null : String(row.started_at),
	completedAt: row.completed_at === null ? null : String(row.completed_at),
	error: row.error === null ? null : String(row.error),
	version: Number(row.version),
});

export class SqliteExecutionRepository implements ExecutionRepository {
	constructor(readonly database: DatabaseSync) {}

	async saveRun(run: ExecutionRun): Promise<void> {
		const current = this.database.prepare("SELECT version FROM execution_runs WHERE id = ?").get(run.id) as Row | undefined;
		if (current && Number(current.version) > run.version) throw new Error("不能用旧版本覆盖执行记录");
		this.database.prepare(`
      INSERT INTO execution_runs (
        id, work_goal_id, work_node_id, goal, model, workspace_roots_json,
        network_enabled, allowed_tools_json, risk, status, thread_id, turn_id,
        created_at, updated_at, started_at, completed_at, error, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        work_goal_id = excluded.work_goal_id,
        work_node_id = excluded.work_node_id,
        goal = excluded.goal,
        model = excluded.model,
        workspace_roots_json = excluded.workspace_roots_json,
        network_enabled = excluded.network_enabled,
        allowed_tools_json = excluded.allowed_tools_json,
        risk = excluded.risk,
        status = excluded.status,
        thread_id = excluded.thread_id,
        turn_id = excluded.turn_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        error = excluded.error,
        version = excluded.version
    `).run(
			run.id,
			run.workGoalId,
			run.workNodeId,
			run.goal,
			run.model,
			JSON.stringify(run.workspaceRoots),
			run.networkEnabled ? 1 : 0,
			JSON.stringify(run.allowedTools),
			run.risk,
			run.status,
			run.threadId,
			run.turnId,
			run.createdAt,
			run.updatedAt,
			run.startedAt,
			run.completedAt,
			run.error,
			run.version,
		);
	}

	async loadRun(runId: string): Promise<ExecutionRun | null> {
		const row = this.database.prepare("SELECT * FROM execution_runs WHERE id = ?").get(runId) as Row | undefined;
		return row ? mapRun(row) : null;
	}

	async listRunsForWorkNode(workNodeId: string): Promise<readonly ExecutionRun[]> {
		return (this.database.prepare(`
      SELECT * FROM execution_runs WHERE work_node_id = ? ORDER BY created_at, rowid
    `).all(workNodeId) as Row[]).map(mapRun);
	}

	async appendEvent(event: ExecutionEvent): Promise<void> {
		try {
			this.database.prepare(`
        INSERT INTO execution_events (id, run_id, sequence, kind, message, at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(event.id, event.runId, event.sequence, event.kind, event.message, event.at);
		} catch (error) {
			if (String(error).includes("UNIQUE constraint failed: execution_events.run_id, execution_events.sequence")) {
				throw new Error("执行事件序号重复");
			}
			throw error;
		}
	}

	async listEvents(runId: string): Promise<readonly ExecutionEvent[]> {
		return (this.database.prepare(`
      SELECT * FROM execution_events WHERE run_id = ? ORDER BY sequence, rowid
    `).all(runId) as Row[]).map((row) => ({
			id: String(row.id),
			runId: String(row.run_id),
			sequence: Number(row.sequence),
			kind: String(row.kind) as ExecutionEventKind,
			message: String(row.message),
			at: String(row.at),
		}));
	}

	async saveApproval(approval: ApprovalRequest): Promise<void> {
		this.database.prepare(`
      INSERT INTO approvals (
        id, run_id, server_request_id, action_kind, risk, summary, status, requested_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        server_request_id = excluded.server_request_id,
        action_kind = excluded.action_kind,
        risk = excluded.risk,
        summary = excluded.summary,
        status = excluded.status,
        requested_at = excluded.requested_at,
        resolved_at = excluded.resolved_at
    `).run(
			approval.id,
			approval.runId,
			approval.serverRequestId,
			approval.actionKind,
			approval.risk,
			approval.summary,
			approval.status,
			approval.requestedAt,
			approval.resolvedAt,
		);
	}

	async listApprovals(runId: string): Promise<readonly ApprovalRequest[]> {
		return (this.database.prepare(`
      SELECT * FROM approvals WHERE run_id = ? ORDER BY requested_at, rowid
    `).all(runId) as Row[]).map((row) => ({
			id: String(row.id),
			runId: String(row.run_id),
			serverRequestId: String(row.server_request_id),
			actionKind: String(row.action_kind),
			risk: String(row.risk) as ExecutionRisk,
			summary: String(row.summary),
			status: String(row.status) as ApprovalStatus,
			requestedAt: String(row.requested_at),
			resolvedAt: row.resolved_at === null ? null : String(row.resolved_at),
		}));
	}

	async saveArtifact(artifact: Artifact): Promise<void> {
		this.database.prepare(`
      INSERT INTO artifacts (
        id, run_id, work_node_id, name, path, sha256, version, verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        sha256 = excluded.sha256,
        version = excluded.version,
        verified = excluded.verified,
        created_at = excluded.created_at
    `).run(
			artifact.id,
			artifact.runId,
			artifact.workNodeId,
			artifact.name,
			artifact.path,
			artifact.sha256,
			artifact.version,
			artifact.verified ? 1 : 0,
			artifact.createdAt,
		);
	}

	async listArtifacts(runId: string): Promise<readonly Artifact[]> {
		return (this.database.prepare(`
      SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at, rowid
    `).all(runId) as Row[]).map((row) => ({
			id: String(row.id),
			runId: String(row.run_id),
			workNodeId: String(row.work_node_id),
			name: String(row.name),
			path: String(row.path),
			sha256: String(row.sha256),
			version: Number(row.version),
			verified: Number(row.verified) === 1,
			createdAt: String(row.created_at),
		}));
	}
}
