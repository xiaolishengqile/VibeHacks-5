import type { DatabaseSync, StatementSync } from "node:sqlite";

import type { StoredWorkAggregate, WorkChange, WorkChangeKind, WorkRepository } from "../work/repositories.js";
import type {
	ConfirmedValue,
	DurationObservation,
	Milestone,
	WaitingObservation,
	WorkGoal,
	WorkNode,
	WorkNodeStatus,
	WorkProfile,
} from "../work/types.js";

type Row = Record<string, string | number | null>;

const parse = <T>(value: string): T => JSON.parse(value) as T;
const text = (value: unknown): string => JSON.stringify(value);

export class SqliteWorkRepository implements WorkRepository {
	constructor(readonly database: DatabaseSync) {}

	async saveAggregate(aggregate: StoredWorkAggregate): Promise<void> {
		const database = this.database;
		database.exec("BEGIN IMMEDIATE");
		try {
			this.#saveProfile(aggregate.profile);
			database.prepare(`
        INSERT INTO goals (id, profile_id, title, description, deadline, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          profile_id = excluded.profile_id,
          title = excluded.title,
          description = excluded.description,
          deadline = excluded.deadline,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
				aggregate.goal.id,
				aggregate.profile.id,
				aggregate.goal.title,
				aggregate.goal.description,
				aggregate.goal.deadline,
				aggregate.goal.status,
				aggregate.goal.createdAt,
				aggregate.goal.updatedAt,
			);

			// 里程碑关联仍可能引用旧节点，替换聚合时先清理上层关系。
			database.prepare("DELETE FROM milestones WHERE goal_id = ?").run(aggregate.goal.id);
			database.prepare("DELETE FROM work_nodes WHERE goal_id = ?").run(aggregate.goal.id);
			const insertNode = database.prepare(`
        INSERT INTO work_nodes (
          id, goal_id, title, owner, potential_collaborator_json,
          work_minutes, wait_minutes, status, latest_start, actual_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
			for (const node of aggregate.nodes) {
				insertNode.run(
					node.id,
					node.goalId,
					node.title,
					node.owner,
					node.potentialCollaborator ? text(node.potentialCollaborator) : null,
					node.workMinutes,
					node.waitMinutes,
					node.status,
					node.latestStart ?? null,
					node.actualMinutes ?? null,
				);
			}
			const insertDependency = database.prepare(
				"INSERT INTO dependencies (node_id, dependency_id) VALUES (?, ?)",
			);
			for (const node of aggregate.nodes) {
				for (const dependencyId of node.dependencyIds) insertDependency.run(node.id, dependencyId);
			}

			const insertMilestone = database.prepare(
				"INSERT INTO milestones (id, goal_id, title, at) VALUES (?, ?, ?, ?)",
			);
			const insertMilestoneNode = database.prepare(
				"INSERT INTO milestone_nodes (milestone_id, node_id) VALUES (?, ?)",
			);
			for (const milestone of aggregate.goal.milestones) {
				insertMilestone.run(milestone.id, aggregate.goal.id, milestone.title, milestone.at);
				for (const nodeId of milestone.nodeIds) insertMilestoneNode.run(milestone.id, nodeId);
			}

			database.prepare("DELETE FROM work_changes WHERE goal_id = ?").run(aggregate.goal.id);
			const insertChange = database.prepare(
				"INSERT INTO work_changes (id, goal_id, kind, reason, created_at) VALUES (?, ?, ?, ?, ?)",
			);
			for (const change of aggregate.changes) {
				insertChange.run(change.id, aggregate.goal.id, change.kind, change.reason, change.createdAt);
			}
			database.exec("COMMIT");
		} catch (error) {
			database.exec("ROLLBACK");
			throw error;
		}
	}

	async loadAggregate(goalId: string): Promise<StoredWorkAggregate | null> {
		const goalRow = this.database.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as Row | undefined;
		if (!goalRow) return null;
		const profile = this.#loadProfile(String(goalRow.profile_id));
		const nodes = this.#loadNodes(goalId);
		const milestones = this.#loadMilestones(goalId);
		const goal: WorkGoal = {
			id: String(goalRow.id),
			title: String(goalRow.title),
			description: String(goalRow.description),
			deadline: String(goalRow.deadline),
			milestones,
			status: String(goalRow.status) as WorkGoal["status"],
			createdAt: String(goalRow.created_at),
			updatedAt: String(goalRow.updated_at),
		};
		const changes = (this.database
			.prepare("SELECT * FROM work_changes WHERE goal_id = ? ORDER BY created_at, rowid")
			.all(goalId) as Row[]).map((row): WorkChange => ({
				id: String(row.id),
				kind: String(row.kind) as WorkChangeKind,
				reason: String(row.reason),
				createdAt: String(row.created_at),
			}));
		return { profile, goal, nodes, changes };
	}

	async loadLatestAggregate(): Promise<StoredWorkAggregate | null> {
		const row = this.database.prepare(`
			SELECT id
			FROM goals
			ORDER BY COALESCE(
				(SELECT MAX(rowid) FROM work_changes WHERE goal_id = goals.id),
				goals.rowid
			) DESC
			LIMIT 1
		`).get() as Row | undefined;
		return row ? this.loadAggregate(String(row.id)) : null;
	}

	#saveProfile(profile: WorkProfile): void {
		this.database.prepare(`
      INSERT INTO profiles (
        id, timezone_json, workday_start_json, workday_end_json,
        daily_capacity_json, buffer_percent_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        timezone_json = excluded.timezone_json,
        workday_start_json = excluded.workday_start_json,
        workday_end_json = excluded.workday_end_json,
        daily_capacity_json = excluded.daily_capacity_json,
        buffer_percent_json = excluded.buffer_percent_json
    `).run(
			profile.id,
			text(profile.timezone),
			text(profile.workdayStart),
			text(profile.workdayEnd),
			text(profile.dailyCapacityMinutes),
			text(profile.bufferPercent),
		);

		this.#replaceObservations(
			"duration_observations",
			profile.id,
			profile.durationObservations,
			this.database.prepare(`
        INSERT INTO duration_observations (
          profile_id, task_type, estimated_minutes, actual_minutes, source_work_node_id, observed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `),
		);
		this.database.prepare("DELETE FROM waiting_observations WHERE profile_id = ?").run(profile.id);
		const insertWaiting = this.database.prepare(`
      INSERT INTO waiting_observations (
        profile_id, collaborator, actual_minutes, source_work_node_id, observed_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
		for (const item of profile.waitingObservations) {
			insertWaiting.run(profile.id, item.collaborator, item.actualMinutes, item.sourceWorkNodeId, item.observedAt);
		}
	}

	#replaceObservations(
		table: "duration_observations",
		profileId: string,
		observations: readonly DurationObservation[],
		statement: StatementSync,
	): void {
		this.database.prepare(`DELETE FROM ${table} WHERE profile_id = ?`).run(profileId);
		for (const item of observations) {
			statement.run(
				profileId,
				item.taskType,
				item.estimatedMinutes,
				item.actualMinutes,
				item.sourceWorkNodeId,
				item.observedAt,
			);
		}
	}

	#loadProfile(profileId: string): WorkProfile {
		const row = this.database.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as Row | undefined;
		if (!row) throw new Error(`找不到个人工作模型：${profileId}`);
		const durationObservations = (this.database
			.prepare("SELECT * FROM duration_observations WHERE profile_id = ? ORDER BY observed_at, rowid")
			.all(profileId) as Row[]).map((item): DurationObservation => ({
				taskType: String(item.task_type),
				estimatedMinutes: Number(item.estimated_minutes),
				actualMinutes: Number(item.actual_minutes),
				sourceWorkNodeId: String(item.source_work_node_id),
				observedAt: String(item.observed_at),
			}));
		const waitingObservations = (this.database
			.prepare("SELECT * FROM waiting_observations WHERE profile_id = ? ORDER BY observed_at, rowid")
			.all(profileId) as Row[]).map((item): WaitingObservation => ({
				collaborator: String(item.collaborator),
				actualMinutes: Number(item.actual_minutes),
				sourceWorkNodeId: String(item.source_work_node_id),
				observedAt: String(item.observed_at),
			}));
		return {
			id: String(row.id),
			timezone: parse<ConfirmedValue<string>>(String(row.timezone_json)),
			workdayStart: parse<ConfirmedValue<string>>(String(row.workday_start_json)),
			workdayEnd: parse<ConfirmedValue<string>>(String(row.workday_end_json)),
			dailyCapacityMinutes: parse<ConfirmedValue<number>>(String(row.daily_capacity_json)),
			bufferPercent: parse<ConfirmedValue<number>>(String(row.buffer_percent_json)),
			durationObservations,
			waitingObservations,
		};
	}

	#loadNodes(goalId: string): readonly WorkNode[] {
		const rows = this.database.prepare("SELECT * FROM work_nodes WHERE goal_id = ? ORDER BY rowid").all(goalId) as Row[];
		const dependencyStatement = this.database.prepare(
			"SELECT dependency_id FROM dependencies WHERE node_id = ? ORDER BY rowid",
		);
		return rows.map((row): WorkNode => {
			const dependencies = (dependencyStatement.all(String(row.id)) as Row[])
				.map((dependency) => String(dependency.dependency_id));
			return {
				id: String(row.id),
				goalId: String(row.goal_id),
				title: String(row.title),
				owner: String(row.owner),
				workMinutes: Number(row.work_minutes),
				waitMinutes: Number(row.wait_minutes),
				dependencyIds: dependencies,
				status: String(row.status) as WorkNodeStatus,
				...(row.potential_collaborator_json
					? { potentialCollaborator: parse(String(row.potential_collaborator_json)) }
					: {}),
				...(row.latest_start ? { latestStart: String(row.latest_start) } : {}),
				...(row.actual_minutes === null ? {} : { actualMinutes: Number(row.actual_minutes) }),
			};
		});
	}

	#loadMilestones(goalId: string): readonly Milestone[] {
		const rows = this.database.prepare("SELECT * FROM milestones WHERE goal_id = ? ORDER BY rowid").all(goalId) as Row[];
		const nodeStatement = this.database.prepare(
			"SELECT node_id FROM milestone_nodes WHERE milestone_id = ? ORDER BY rowid",
		);
		return rows.map((row): Milestone => ({
			id: String(row.id),
			title: String(row.title),
			at: String(row.at),
			nodeIds: (nodeStatement.all(String(row.id)) as Row[]).map((item) => String(item.node_id)),
		}));
	}
}
