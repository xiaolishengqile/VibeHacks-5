import type { ApprovalRequest, Artifact, ExecutionEvent, ExecutionRun } from "./types.js";

export interface ExecutionRepository {
	saveRun(run: ExecutionRun): Promise<void>;
	loadRun(runId: string): Promise<ExecutionRun | null>;
	listRunsForWorkNode(workNodeId: string): Promise<readonly ExecutionRun[]>;
	appendEvent(event: ExecutionEvent): Promise<void>;
	listEvents(runId: string): Promise<readonly ExecutionEvent[]>;
	saveApproval(approval: ApprovalRequest): Promise<void>;
	listApprovals(runId: string): Promise<readonly ApprovalRequest[]>;
	saveArtifact(artifact: Artifact): Promise<void>;
	listArtifacts(runId: string): Promise<readonly Artifact[]>;
}
