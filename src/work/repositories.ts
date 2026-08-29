import type { WorkGoal, WorkNode, WorkProfile } from "./types.js";

export type WorkChangeKind =
	| "created"
	| "deadlineChanged"
	| "milestoneChanged"
	| "ownerChanged"
	| "stopped"
	| "durationRecorded"
	| "executionStarted"
	| "artifactReady"
	| "executionFailed"
	| "artifactAccepted"
	| "todoAdded"
	| "profileConfirmed";

export interface WorkChange {
	readonly id: string;
	readonly kind: WorkChangeKind;
	readonly reason: string;
	readonly createdAt: string;
}

export interface StoredWorkAggregate {
	readonly profile: WorkProfile;
	readonly goal: WorkGoal;
	readonly nodes: readonly WorkNode[];
	readonly changes: readonly WorkChange[];
}

export interface WorkRepository {
	loadAggregate(goalId: string): Promise<StoredWorkAggregate | null>;
	loadLatestAggregate(): Promise<StoredWorkAggregate | null>;
	saveAggregate(aggregate: StoredWorkAggregate): Promise<void>;
}

export interface Clock {
	now(): string;
}
