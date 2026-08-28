import type { ExecutionAgentEvent, UserApprovalDecision } from "../codex/execution-agent.js";
import type { ExecutionOrchestrator } from "../execution/orchestrator.js";
import type { CreateExecutionRequest } from "../execution/orchestrator-types.js";
import type { ExecutionRepository } from "../execution/repositories.js";
import type { ExecutionRun } from "../execution/types.js";
import type { Clock } from "../work/repositories.js";
import type { WorkDraftInterpretation } from "../work/interpreter.js";
import type { WorkDraft } from "../work/types.js";
import type {
	ApplicationSnapshot,
	ArtifactSummary,
	ExecutionSummary,
	UiCommand,
	VisibleApplicationEvent,
} from "./application-service.js";
import type { CodexSetupState } from "./codex-setup.js";

interface CoreBackend {
	getSnapshot(): Promise<ApplicationSnapshot>;
	submitText(text: string): Promise<ApplicationSnapshot>;
	createFromDraft(draft: WorkDraft): Promise<ApplicationSnapshot>;
	runCommand(command: UiCommand): Promise<ApplicationSnapshot>;
}

interface SetupBackend {
	readiness(refresh?: boolean): Promise<CodexSetupState>;
	startBrowserLogin(): Promise<void>;
}

interface DesktopInterpreter {
	interpret(text: string): Promise<WorkDraftInterpretation>;
}

type OrchestratorCommands = Pick<ExecutionOrchestrator,
	"create" | "plan" | "confirmPlan" | "answerApproval" | "cancel" | "resume" | "acceptArtifact">;

export interface DesktopExecutionRuntime {
	readonly interpreter: DesktopInterpreter;
	readonly orchestrator: OrchestratorCommands;
	close(): void | Promise<void>;
}

interface IntegratedBackendOptions {
	readonly core: CoreBackend;
	readonly setup: SetupBackend;
	readonly executionRepository: ExecutionRepository;
	readonly createRuntime: (publish: (event: VisibleApplicationEvent) => void) => Promise<DesktopExecutionRuntime>;
	readonly openArtifact: (path: string) => Promise<void>;
	readonly clock: Clock;
}

type VisibleListener = (event: VisibleApplicationEvent) => void;

const visibleKind = (event: ExecutionAgentEvent): VisibleApplicationEvent["kind"] => {
	if (event.type === "approvalRequested") return "approval";
	if (event.type === "artifact") return "artifact";
	if (event.type === "turnFailed") return "error";
	if (event.type === "turnInterrupted" || event.type === "approvalDenied") return "warning";
	return "progress";
};

export function toVisibleAgentEvent(event: ExecutionAgentEvent, at: string): VisibleApplicationEvent {
	return { kind: visibleKind(event), message: event.message, at };
}

export class IntegratedDesktopBackend {
	readonly #options: IntegratedBackendOptions;
	readonly #listeners = new Set<VisibleListener>();
	#runtime: DesktopExecutionRuntime | null = null;
	#workDirectory: string | null = null;

	constructor(options: IntegratedBackendOptions) {
		this.#options = options;
	}

	setWorkDirectory(path: string | null): void {
		this.#workDirectory = path?.trim() || null;
	}

	subscribe(listener: VisibleListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	async getSnapshot(): Promise<ApplicationSnapshot> {
		const [core, codex] = await Promise.all([
			this.#options.core.getSnapshot(),
			this.#options.setup.readiness(),
		]);
		const runs = (await Promise.all(core.nodes.map((node) =>
			this.#options.executionRepository.listRunsForWorkNode(node.id))))
			.flat()
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
		const details = await Promise.all(runs.map(async (run) => ({
			run,
			events: await this.#options.executionRepository.listEvents(run.id),
			approvals: await this.#options.executionRepository.listApprovals(run.id),
			artifacts: await this.#options.executionRepository.listArtifacts(run.id),
		})));
		const executions: ExecutionSummary[] = details.map(({ run, events }) => ({
			id: run.id,
			title: run.goal,
			status: run.status,
			progress: events.at(-1)?.message ?? "等待开始",
			updatedAt: run.updatedAt,
			model: run.model,
			workspaceRoots: run.workspaceRoots,
			networkEnabled: run.networkEnabled,
			allowedTools: run.allowedTools,
			risk: run.risk,
			error: run.error,
		}));
		const approvals = details.flatMap(({ run, approvals }) => approvals
			.filter((approval) => approval.status === "pending")
			.map((approval) => ({
				id: approval.id,
				executionId: run.id,
				requestId: approval.serverRequestId,
				summary: approval.summary,
				risk: approval.risk,
			})));
		const artifacts: ArtifactSummary[] = details.flatMap(({ run, artifacts }) => artifacts.map((artifact) => ({
			id: artifact.id,
			executionId: run.id,
			workNodeId: artifact.workNodeId,
			name: artifact.name,
			path: artifact.path,
			verified: artifact.verified,
		})));
		return { ...core, executions, approvals, artifacts, workDirectory: this.#workDirectory, codex };
	}

	async submitText(text: string): Promise<ApplicationSnapshot> {
		const setup = await this.#options.setup.readiness();
		if (!setup.ready) return this.#options.core.submitText(text);
		const interpretation = await (await this.#ensureRuntime()).interpreter.interpret(text);
		if (interpretation.status === "needsInput") throw new Error(interpretation.questions[0]);
		if (interpretation.status === "failed") throw new Error(interpretation.error);
		await this.#options.core.createFromDraft(interpretation.draft);
		return this.getSnapshot();
	}

	async runCommand(command: UiCommand): Promise<ApplicationSnapshot> {
		switch (command.name) {
			case "startExecution":
				await this.#startExecution(command.goalId, command.nodeId, command.allowWebResearch);
				break;
			case "confirmExecutionPlan":
				await this.#confirmPlan(command.executionId);
				break;
			case "answerExecutionApproval":
				await (await this.#ensureRuntime()).orchestrator.answerApproval(
					command.executionId,
					command.requestId,
					command.decision satisfies UserApprovalDecision,
				);
				break;
			case "cancelExecution":
				await (await this.#ensureRuntime()).orchestrator.cancel(command.executionId);
				break;
			case "resumeExecution":
				await (await this.#ensureRuntime()).orchestrator.resume(command.executionId);
				break;
			case "acceptExecutionArtifact":
				await (await this.#ensureRuntime()).orchestrator.acceptArtifact(
					command.executionId,
					command.artifactId,
					command.actualMinutes,
				);
				break;
			case "openExecutionArtifact":
				await this.#openArtifact(command.executionId, command.artifactId);
				break;
			case "startCodexLogin":
				await this.#options.setup.startBrowserLogin();
				this.#publish({ kind: "info", message: "浏览器登录已打开，完成后请刷新状态", at: this.#options.clock.now() });
				break;
			case "refreshCodex":
				await this.#options.setup.readiness(true);
				break;
			default:
				await this.#options.core.runCommand(command);
		}
		return this.getSnapshot();
	}

	async close(): Promise<void> {
		const runtime = this.#runtime;
		this.#runtime = null;
		if (runtime) await runtime.close();
		this.#listeners.clear();
	}

	async #startExecution(goalId: string, nodeId: string, allowWebResearch: boolean): Promise<void> {
		if (!this.#workDirectory) throw new Error("请先选择执行工作目录");
		const snapshot = await this.#options.core.getSnapshot();
		if (snapshot.goal?.id !== goalId) throw new Error("工作目标已经变化，请刷新后重试");
		const node = snapshot.nodes.find((entry) => entry.id === nodeId);
		if (!node) throw new Error("找不到要执行的工作节点");
		const setup = await this.#options.setup.readiness();
		if (!setup.ready || !setup.model) throw new Error(setup.reason);
		const request: CreateExecutionRequest = {
			workGoalId: goalId,
			workNodeId: nodeId,
			goal: node.title,
			model: setup.model,
			workspaceRoots: [this.#workDirectory],
			networkEnabled: allowWebResearch,
			allowedTools: allowWebResearch
				? ["读取文件", "创建文件", "运行测试", "公开网页调研"]
				: ["读取文件", "创建文件", "运行测试"],
			risk: "medium",
		};
		const orchestrator = (await this.#ensureRuntime()).orchestrator;
		const run = await orchestrator.create(request);
		await orchestrator.plan(run.id);
	}

	async #confirmPlan(executionId: string): Promise<void> {
		const run = await this.#requiredRun(executionId);
		await (await this.#ensureRuntime()).orchestrator.confirmPlan(executionId, {
			workspaceRoots: run.workspaceRoots,
			networkEnabled: run.networkEnabled,
			allowedTools: run.allowedTools,
			risk: run.risk,
		});
	}

	async #openArtifact(executionId: string, artifactId: string): Promise<void> {
		const artifact = (await this.#options.executionRepository.listArtifacts(executionId))
			.find((entry) => entry.id === artifactId && entry.verified);
		if (!artifact) throw new Error("成果不存在或尚未验证");
		await this.#options.openArtifact(artifact.path);
	}

	async #requiredRun(runId: string): Promise<ExecutionRun> {
		const run = await this.#options.executionRepository.loadRun(runId);
		if (!run) throw new Error(`找不到执行任务：${runId}`);
		return run;
	}

	async #ensureRuntime(): Promise<DesktopExecutionRuntime> {
		this.#runtime ??= await this.#options.createRuntime((event) => this.#publish(event));
		return this.#runtime;
	}

	#publish(event: VisibleApplicationEvent): void {
		for (const listener of this.#listeners) listener(event);
	}
}
