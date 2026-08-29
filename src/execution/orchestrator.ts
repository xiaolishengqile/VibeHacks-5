import type { UserApprovalDecision } from "../codex/execution-agent.js";
import type { IdGenerator } from "../shared/ids.js";
import type { Clock } from "../work/repositories.js";
import { ArtifactManager } from "./artifacts.js";
import { ExecutionEventProcessor } from "./execution-event-processor.js";
import type {
	ConfirmedExecutionScope,
	CreateExecutionRequest,
	ExecutionAgentPort,
	WorkExecutionPort,
} from "./orchestrator-types.js";
import type { ExecutionRepository } from "./repositories.js";
import { transitionExecution } from "./state-machine.js";
import type { ExecutionRun } from "./types.js";

export type {
	ConfirmedExecutionScope,
	CreateExecutionRequest,
	ExecutionAgentPort,
	WorkExecutionPort,
} from "./orchestrator-types.js";

export class ExecutionOrchestrator {
	readonly #processor: ExecutionEventProcessor;
	readonly #unsubscribe: () => void;

	constructor(
		readonly repository: ExecutionRepository,
		readonly agent: ExecutionAgentPort,
		artifacts: ArtifactManager,
		readonly work: WorkExecutionPort,
		readonly ids: IdGenerator,
		readonly clock: Clock,
	) {
		this.#processor = new ExecutionEventProcessor(repository, artifacts, work, ids, clock);
		this.#unsubscribe = agent.onEvent((event) => this.#processor.enqueue(event));
	}

	async create(request: CreateExecutionRequest): Promise<ExecutionRun> {
		if (!request.goal.trim()) throw new Error("执行目标不能为空");
		if (!request.model.trim()) throw new Error("执行模型不能为空");
		if (request.workspaceRoots.length === 0) throw new Error("至少选择一个工作目录");
		const now = this.clock.now();
		const run: ExecutionRun = {
			id: this.ids.next("run"),
			workGoalId: request.workGoalId,
			workNodeId: request.workNodeId,
			goal: request.goal.trim(),
			model: request.model,
			workspaceRoots: [...request.workspaceRoots],
			networkEnabled: request.networkEnabled,
			allowedTools: [...request.allowedTools],
			risk: request.risk,
			status: "queued",
			threadId: null,
			turnId: null,
			createdAt: now,
			updatedAt: now,
			startedAt: null,
			completedAt: null,
			error: null,
			version: 1,
		};
		await this.repository.saveRun(run);
		this.#processor.registerRules(run.id, request.verificationRules ?? []);
		await this.#processor.append(run.id, "progress", "执行任务已创建");
		return run;
	}

	async plan(runId: string): Promise<ExecutionRun> {
		let run = transitionExecution(await this.#requiredRun(runId), "planning", this.clock.now());
		await this.repository.saveRun(run);
		await this.#processor.append(run.id, "progress", "开始生成执行计划");
		try {
			run = this.#withRuntime(run, await this.agent.plan(run));
			await this.repository.saveRun(run);
			return run;
		} catch (error) {
			return this.#processor.fail(run, this.#errorMessage(error));
		}
	}

	async confirmPlan(runId: string, scope: ConfirmedExecutionScope): Promise<ExecutionRun> {
		let run = await this.#requiredRun(runId);
		if (run.status !== "awaitingApproval" || run.startedAt !== null) throw new Error("当前没有等待确认的执行计划");
		if (scope.workspaceRoots.length === 0) throw new Error("确认范围必须包含工作目录");
		run = transitionExecution({
			...run,
			workspaceRoots: [...scope.workspaceRoots],
			networkEnabled: scope.networkEnabled,
			allowedTools: [...scope.allowedTools],
			risk: scope.risk,
			updatedAt: this.clock.now(),
			version: run.version + 1,
		}, "running", this.clock.now());
		await this.repository.saveRun(run);
		try {
			await this.work.start(run.workGoalId, run.workNodeId);
			run = this.#withRuntime(run, await this.agent.execute(run));
			await this.repository.saveRun(run);
			return run;
		} catch (error) {
			return this.#processor.fail(run, this.#errorMessage(error));
		}
	}

	async answerApproval(runId: string, serverRequestId: string, decision: UserApprovalDecision): Promise<void> {
		let run = await this.#requiredRun(runId);
		const approval = (await this.repository.listApprovals(runId))
			.find((entry) => entry.serverRequestId === serverRequestId && entry.status === "pending");
		if (!approval) throw new Error("找不到等待处理的审批请求");
		const now = this.clock.now();
		await this.repository.saveApproval({
			...approval,
			status: decision === "deny" ? "denied" : "approved",
			resolvedAt: now,
		});
		if (run.status === "awaitingApproval") {
			run = transitionExecution(run, "running", now);
			await this.repository.saveRun(run);
		}
		try { await this.agent.approve(serverRequestId, decision); }
		catch (error) { await this.#processor.fail(run, this.#errorMessage(error)); }
	}

	async cancel(runId: string): Promise<ExecutionRun> {
		const run = transitionExecution(await this.#requiredRun(runId), "canceled", this.clock.now());
		await this.repository.saveRun(run);
		await this.#processor.append(run.id, "warning", "用户取消了执行");
		if (run.threadId && run.turnId) {
			try { await this.agent.interrupt(run); }
			catch { await this.#processor.append(run.id, "warning", "执行代理已退出，无需再次中断"); }
		}
		return run;
	}

	async resume(runId: string): Promise<ExecutionRun> {
		let run = transitionExecution(await this.#requiredRun(runId), "running", this.clock.now());
		await this.repository.saveRun(run);
		try {
			run = this.#withRuntime(run, await this.agent.execute(run));
			await this.repository.saveRun(run);
			return run;
		} catch (error) {
			return this.#processor.fail(run, this.#errorMessage(error));
		}
	}

	async acceptArtifact(runId: string, artifactId: string, actualMinutes: number): Promise<void> {
		const run = await this.#requiredRun(runId);
		if (run.status !== "succeeded") throw new Error("执行成果尚未通过验证");
		if (!Number.isInteger(actualMinutes) || actualMinutes < 0) throw new Error("实际耗时无效");
		const artifact = (await this.repository.listArtifacts(runId)).find((entry) => entry.id === artifactId);
		if (!artifact?.verified) throw new Error("成果不存在或尚未验证");
		await this.work.accept(run.workGoalId, run.workNodeId, artifactId, actualMinutes);
		await this.#processor.append(run.id, "artifact", `用户已接受成果：${artifact.name}`);
	}

	async close(): Promise<void> {
		this.#unsubscribe();
		await this.#processor.drain();
		this.#processor.clearRules();
	}

	#withRuntime(run: ExecutionRun, runtime: { threadId: string; turnId: string }): ExecutionRun {
		return { ...run, ...runtime, updatedAt: this.clock.now(), version: run.version + 1 };
	}

	async #requiredRun(runId: string): Promise<ExecutionRun> {
		const run = await this.repository.loadRun(runId);
		if (!run) throw new Error(`找不到执行任务：${runId}`);
		return run;
	}

	#errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : "执行失败";
	}
}
