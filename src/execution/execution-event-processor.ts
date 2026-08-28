import { basename } from "node:path";

import type { ExecutionAgentEvent } from "../codex/execution-agent.js";
import type { IdGenerator } from "../shared/ids.js";
import type { Clock } from "../work/repositories.js";
import { ArtifactManager, type ArtifactVerificationRule } from "./artifacts.js";
import type { WorkExecutionPort } from "./orchestrator-types.js";
import type { ExecutionRepository } from "./repositories.js";
import { transitionExecution } from "./state-machine.js";
import type { ApprovalRequest, Artifact, ExecutionEventKind, ExecutionRun } from "./types.js";

const eventKind = (event: ExecutionAgentEvent): ExecutionEventKind => {
	if (event.type === "plan") return "plan";
	if (event.type === "tool") return "tool";
	if (event.type === "artifact") return "artifact";
	if (event.type === "approvalRequested") return "approvalRequested";
	if (event.type === "approvalResolved" || event.type === "approvalDenied") return "approvalResolved";
	if (event.type === "turnFailed") return "error";
	if (event.type === "turnInterrupted") return "warning";
	return "progress";
};

export class ExecutionEventProcessor {
	readonly #rules = new Map<string, readonly ArtifactVerificationRule[]>();
	readonly #queues = new Map<string, Promise<void>>();

	constructor(
		readonly repository: ExecutionRepository,
		readonly artifacts: ArtifactManager,
		readonly work: WorkExecutionPort,
		readonly ids: IdGenerator,
		readonly clock: Clock,
	) {}

	registerRules(runId: string, rules: readonly ArtifactVerificationRule[]): void {
		this.#rules.set(runId, rules);
	}

	clearRules(): void {
		this.#rules.clear();
	}

	enqueue(event: ExecutionAgentEvent): Promise<void> {
		const previous = this.#queues.get(event.runId) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(() => this.#handle(event));
		this.#queues.set(event.runId, current);
		return current.finally(() => {
			if (this.#queues.get(event.runId) === current) this.#queues.delete(event.runId);
		});
	}

	async fail(run: ExecutionRun, reason: string): Promise<ExecutionRun> {
		if (!["planning", "running", "verifying"].includes(run.status)) return run;
		const failed = transitionExecution(run, "failed", this.clock.now(), reason);
		await this.repository.saveRun(failed);
		await this.append(run.id, "error", reason);
		if (run.startedAt !== null) await this.work.fail(run.workGoalId, run.workNodeId, reason);
		return failed;
	}

	async append(runId: string, kind: ExecutionEventKind, message: string): Promise<void> {
		const events = await this.repository.listEvents(runId);
		await this.repository.appendEvent({
			id: this.ids.next("event"),
			runId,
			sequence: (events.at(-1)?.sequence ?? 0) + 1,
			kind,
			message,
			at: this.clock.now(),
		});
	}

	async #handle(event: ExecutionAgentEvent): Promise<void> {
		const run = await this.#requiredRun(event.runId);
		if (["succeeded", "failed", "canceled"].includes(run.status)) return;
		await this.append(run.id, eventKind(event), event.message);
		if (event.type === "artifact") await this.#registerArtifacts(run, event.paths);
		if (event.type === "approvalRequested") await this.#approvalRequested(run, event);
		if (event.type === "turnFailed") await this.fail(run, event.message);
		if (event.type === "turnInterrupted") await this.#pause(run);
		if (event.type === "turnCompleted") await this.#turnCompleted(run);
	}

	async #approvalRequested(run: ExecutionRun, event: Extract<ExecutionAgentEvent, { type: "approvalRequested" }>): Promise<void> {
		const approval: ApprovalRequest = {
			id: this.ids.next("approval"),
			runId: run.id,
			serverRequestId: event.requestId,
			actionKind: "执行操作",
			risk: event.risk,
			summary: event.message,
			status: "pending",
			requestedAt: this.clock.now(),
			resolvedAt: null,
		};
		await this.repository.saveApproval(approval);
		if (run.status === "running") {
			await this.repository.saveRun(transitionExecution(run, "awaitingApproval", this.clock.now()));
		}
	}

	async #registerArtifacts(run: ExecutionRun, paths: readonly string[]): Promise<void> {
		const known: Artifact[] = [...await this.repository.listArtifacts(run.id)];
		for (const path of paths) {
			if (known.some((artifact) => artifact.path === path)) continue;
			const name = basename(path);
			const artifact: Artifact = {
				id: this.ids.next("artifact"),
				runId: run.id,
				workNodeId: run.workNodeId,
				name,
				path,
				sha256: "",
				version: known.filter((entry) => entry.name === name).length + 1,
				verified: false,
				createdAt: this.clock.now(),
			};
			await this.repository.saveArtifact(artifact);
			known.push(artifact);
		}
	}

	async #turnCompleted(run: ExecutionRun): Promise<void> {
		if (run.status === "planning") {
			await this.repository.saveRun(transitionExecution(run, "awaitingApproval", this.clock.now()));
			return;
		}
		if (run.status !== "running") return;
		const verifying = transitionExecution(run, "verifying", this.clock.now());
		await this.repository.saveRun(verifying);
		try {
			const artifacts = await this.repository.listArtifacts(run.id);
			if (artifacts.length === 0) throw new Error("执行代理没有产生可验收成果");
			for (const artifact of artifacts) {
				const result = await this.artifacts.verify(
					artifact.path,
					verifying.workspaceRoots,
					this.#rules.get(run.id) ?? [],
				);
				await this.repository.saveArtifact({ ...artifact, path: result.path, sha256: result.sha256, verified: true });
			}
			await this.repository.saveRun(transitionExecution(verifying, "succeeded", this.clock.now()));
			await this.work.review(run.workGoalId, run.workNodeId);
		} catch (error) {
			await this.fail(verifying, error instanceof Error ? error.message : "成果验证失败");
		}
	}

	async #pause(run: ExecutionRun): Promise<void> {
		if (["planning", "running", "verifying"].includes(run.status)) {
			await this.repository.saveRun(transitionExecution(run, "paused", this.clock.now()));
		}
	}

	async #requiredRun(runId: string): Promise<ExecutionRun> {
		const run = await this.repository.loadRun(runId);
		if (!run) throw new Error(`找不到执行任务：${runId}`);
		return run;
	}
}
