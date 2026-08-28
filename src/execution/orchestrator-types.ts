import type { ExecutionAgentEvent, UserApprovalDecision } from "../codex/execution-agent.js";
import type { ArtifactVerificationRule } from "./artifacts.js";
import type { ExecutionRisk, ExecutionRun } from "./types.js";

export interface ExecutionAgentPort {
	plan(run: ExecutionRun): Promise<{ readonly threadId: string; readonly turnId: string }>;
	execute(run: ExecutionRun): Promise<{ readonly threadId: string; readonly turnId: string }>;
	approve(requestId: string, decision: UserApprovalDecision): Promise<void>;
	interrupt(run: ExecutionRun): Promise<void>;
	onEvent(listener: (event: ExecutionAgentEvent) => void | Promise<void>): () => void;
}

export interface WorkExecutionPort {
	start(workGoalId: string, workNodeId: string): Promise<void>;
	review(workGoalId: string, workNodeId: string): Promise<void>;
	fail(workGoalId: string, workNodeId: string, reason: string): Promise<void>;
	accept(workGoalId: string, workNodeId: string, artifactId: string, actualMinutes: number): Promise<void>;
}

export interface CreateExecutionRequest {
	readonly workGoalId: string;
	readonly workNodeId: string;
	readonly goal: string;
	readonly model: string;
	readonly workspaceRoots: readonly string[];
	readonly networkEnabled: boolean;
	readonly allowedTools: readonly string[];
	readonly risk: ExecutionRisk;
	readonly verificationRules?: readonly ArtifactVerificationRule[];
}

export interface ConfirmedExecutionScope {
	readonly workspaceRoots: readonly string[];
	readonly networkEnabled: boolean;
	readonly allowedTools: readonly string[];
	readonly risk: ExecutionRisk;
}
