export type ExecutionStatus =
	| "queued"
	| "planning"
	| "awaitingApproval"
	| "running"
	| "verifying"
	| "paused"
	| "succeeded"
	| "failed"
	| "canceled";

export type ExecutionRisk = "low" | "medium" | "high";

export interface ExecutionRun {
	readonly id: string;
	readonly workNodeId: string;
	readonly goal: string;
	readonly workspaceRoots: readonly string[];
	readonly networkEnabled: boolean;
	readonly allowedTools: readonly string[];
	readonly risk: ExecutionRisk;
	readonly status: ExecutionStatus;
	readonly threadId: string | null;
	readonly turnId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly error: string | null;
	readonly version: number;
}

export type ExecutionEventKind =
	| "plan"
	| "progress"
	| "tool"
	| "approvalRequested"
	| "approvalResolved"
	| "artifact"
	| "warning"
	| "error";

export interface ExecutionEvent {
	readonly id: string;
	readonly runId: string;
	readonly sequence: number;
	readonly kind: ExecutionEventKind;
	readonly message: string;
	readonly at: string;
}

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface ApprovalRequest {
	readonly id: string;
	readonly runId: string;
	readonly serverRequestId: string;
	readonly actionKind: string;
	readonly risk: ExecutionRisk;
	readonly summary: string;
	readonly status: ApprovalStatus;
	readonly requestedAt: string;
	readonly resolvedAt: string | null;
}

export interface Artifact {
	readonly id: string;
	readonly runId: string;
	readonly workNodeId: string;
	readonly name: string;
	readonly path: string;
	readonly sha256: string;
	readonly version: number;
	readonly verified: boolean;
	readonly createdAt: string;
}
