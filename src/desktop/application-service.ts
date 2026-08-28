import type { WorkDecision } from "../work/decision-engine.js";
import type { WorkChange } from "../work/repositories.js";
import type { WorkGoal, WorkNode } from "../work/types.js";
import type { ExecutionRisk, ExecutionStatus } from "../execution/types.js";
import type { CodexSetupState } from "./codex-setup.js";

export type UiCommand =
	| { readonly name: "changeDeadline"; readonly goalId: string; readonly deadline: string }
	| { readonly name: "changeMilestone"; readonly goalId: string; readonly milestoneId: string; readonly at: string }
	| { readonly name: "changeOwner"; readonly goalId: string; readonly nodeId: string; readonly owner: string }
	| { readonly name: "prepareStop"; readonly goalId: string; readonly nodeId: string }
	| { readonly name: "confirmStop"; readonly goalId: string; readonly token: string }
	| { readonly name: "recordDuration"; readonly goalId: string; readonly nodeId: string; readonly actualMinutes: number }
	| { readonly name: "acceptArtifact"; readonly goalId: string; readonly nodeId: string; readonly artifactId: string }
	| {
		readonly name: "startExecution";
		readonly goalId: string;
		readonly nodeId: string;
		readonly allowWebResearch: boolean;
	}
	| { readonly name: "confirmExecutionPlan"; readonly executionId: string }
	| {
		readonly name: "answerExecutionApproval";
		readonly executionId: string;
		readonly requestId: string;
		readonly decision: "approve" | "deny";
	}
	| { readonly name: "cancelExecution"; readonly executionId: string }
	| { readonly name: "resumeExecution"; readonly executionId: string }
	| {
		readonly name: "acceptExecutionArtifact";
		readonly executionId: string;
		readonly artifactId: string;
		readonly actualMinutes: number;
	}
	| { readonly name: "openExecutionArtifact"; readonly executionId: string; readonly artifactId: string }
	| { readonly name: "startCodexLogin" }
	| { readonly name: "refreshCodex" };

export type VisibleEventKind = "info" | "progress" | "approval" | "artifact" | "warning" | "error";

export interface VisibleApplicationEvent {
	readonly kind: VisibleEventKind;
	readonly message: string;
	readonly at: string;
}

export interface ExecutionSummary {
	readonly id: string;
	readonly title: string;
	readonly status: ExecutionStatus;
	readonly progress: string;
	readonly updatedAt: string;
	readonly model: string;
	readonly workspaceRoots: readonly string[];
	readonly networkEnabled: boolean;
	readonly allowedTools: readonly string[];
	readonly risk: ExecutionRisk;
	readonly error: string | null;
}

export interface ApprovalSummary {
	readonly id: string;
	readonly executionId: string;
	readonly requestId: string;
	readonly summary: string;
	readonly risk: "low" | "medium" | "high";
}

export interface ArtifactSummary {
	readonly id: string;
	readonly executionId: string;
	readonly workNodeId: string;
	readonly name: string;
	readonly path: string;
	readonly verified: boolean;
}

export interface ApplicationSnapshot {
	readonly goal: WorkGoal | null;
	readonly nodes: readonly WorkNode[];
	readonly decisions: readonly WorkDecision[];
	readonly changes: readonly WorkChange[];
	readonly executions: readonly ExecutionSummary[];
	readonly approvals: readonly ApprovalSummary[];
	readonly artifacts: readonly ArtifactSummary[];
	readonly events: readonly VisibleApplicationEvent[];
	readonly workDirectory: string | null;
	readonly pendingStop: { readonly token: string; readonly affectedNodeIds: readonly string[] } | null;
	readonly codex: CodexSetupState;
}

export const emptyApplicationSnapshot = (): ApplicationSnapshot => ({
	goal: null,
	nodes: [],
	decisions: [],
	changes: [],
	executions: [],
	approvals: [],
	artifacts: [],
	events: [],
	workDirectory: null,
	pendingStop: null,
	codex: {
		ready: false,
		reason: "正在检查执行代理",
		canStartBrowserLogin: false,
		executable: null,
		version: null,
		account: "正在检查",
		model: null,
		rateLimit: "正在检查",
	},
});

interface ApplicationServiceOptions {
	readonly initialSnapshot?: ApplicationSnapshot;
	readonly getSnapshot?: () => Promise<ApplicationSnapshot>;
	readonly submitText?: (text: string) => Promise<ApplicationSnapshot>;
	readonly runCommand?: (command: UiCommand) => Promise<ApplicationSnapshot>;
	readonly chooseDirectory?: () => Promise<readonly string[]>;
	readonly openWorkbench?: () => void;
}

type EventListener = (event: VisibleApplicationEvent) => void;

const eventKinds = new Set<VisibleEventKind>(["info", "progress", "approval", "artifact", "warning", "error"]);

const sanitizeEvent = (input: unknown): VisibleApplicationEvent | null => {
	if (typeof input !== "object" || input === null) return null;
	const event = input as Record<string, unknown>;
	if (!eventKinds.has(event.kind as VisibleEventKind)) return null;
	if (typeof event.message !== "string" || !event.message.trim()) return null;
	if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) return null;
	return {
		kind: event.kind as VisibleEventKind,
		message: event.message.trim(),
		at: event.at,
	};
};

export class ApplicationService {
	readonly #options: ApplicationServiceOptions;
	readonly #listeners = new Set<EventListener>();
	#snapshot: ApplicationSnapshot;

	constructor(options: ApplicationServiceOptions = {}) {
		this.#options = options;
		this.#snapshot = options.initialSnapshot ?? emptyApplicationSnapshot();
	}

	async getSnapshot(): Promise<ApplicationSnapshot> {
		if (this.#options.getSnapshot) {
			this.#snapshot = this.#mergeBusinessSnapshot(await this.#options.getSnapshot());
		}
		return structuredClone(this.#snapshot);
	}

	async submitWorkText(text: string): Promise<ApplicationSnapshot> {
		const normalized = text.trim();
		if (!normalized) throw new Error("工作描述不能为空");
		if (!this.#options.submitText) throw new Error("工作理解服务尚未就绪");
		this.#snapshot = this.#mergeBusinessSnapshot(await this.#options.submitText(normalized));
		return this.getSnapshot();
	}

	async runCommand(command: UiCommand): Promise<ApplicationSnapshot> {
		if (!this.#options.runCommand) throw new Error("当前没有可操作的工作计划");
		this.#snapshot = this.#mergeBusinessSnapshot(await this.#options.runCommand(command));
		return this.getSnapshot();
	}

	openWorkbench(): void {
		this.#options.openWorkbench?.();
	}

	async chooseWorkDirectory(): Promise<string | null> {
		const selected = await this.#options.chooseDirectory?.() ?? [];
		const path = selected.find((item) => typeof item === "string" && item.trim())?.trim() ?? null;
		this.#snapshot = { ...this.#snapshot, workDirectory: path };
		return path;
	}

	subscribe(listener: EventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	publishEvent(input: unknown): void {
		const event = sanitizeEvent(input);
		if (!event) return;
		this.#snapshot = { ...this.#snapshot, events: [...this.#snapshot.events, event].slice(-200) };
		for (const listener of this.#listeners) listener(event);
	}

	#mergeBusinessSnapshot(next: ApplicationSnapshot): ApplicationSnapshot {
		return {
			...next,
			workDirectory: next.workDirectory ?? this.#snapshot.workDirectory,
			events: next.events.length > 0 ? next.events : this.#snapshot.events,
		};
	}
}
