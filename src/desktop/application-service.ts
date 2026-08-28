import type { WorkDecision } from "../work/decision-engine.js";
import type { WorkChange } from "../work/repositories.js";
import type { WorkGoal, WorkNode } from "../work/types.js";

export type UiCommand =
	| { readonly name: "changeDeadline"; readonly goalId: string; readonly deadline: string }
	| { readonly name: "changeMilestone"; readonly goalId: string; readonly milestoneId: string; readonly at: string }
	| { readonly name: "changeOwner"; readonly goalId: string; readonly nodeId: string; readonly owner: string }
	| { readonly name: "prepareStop"; readonly goalId: string; readonly nodeId: string }
	| { readonly name: "confirmStop"; readonly goalId: string; readonly token: string }
	| { readonly name: "recordDuration"; readonly goalId: string; readonly nodeId: string; readonly actualMinutes: number }
	| { readonly name: "acceptArtifact"; readonly goalId: string; readonly nodeId: string; readonly artifactId: string };

export type VisibleEventKind = "info" | "progress" | "approval" | "artifact" | "warning" | "error";

export interface VisibleApplicationEvent {
	readonly kind: VisibleEventKind;
	readonly message: string;
	readonly at: string;
}

export interface ExecutionSummary {
	readonly id: string;
	readonly title: string;
	readonly status: "planning" | "awaitingApproval" | "running" | "verifying" | "succeeded" | "failed" | "paused";
	readonly progress: string;
	readonly updatedAt: string;
}

export interface ApprovalSummary {
	readonly id: string;
	readonly executionId: string;
	readonly summary: string;
	readonly risk: "low" | "medium" | "high";
}

export interface ArtifactSummary {
	readonly id: string;
	readonly executionId: string;
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
});

interface ApplicationServiceOptions {
	readonly initialSnapshot?: ApplicationSnapshot;
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
		return structuredClone(this.#snapshot);
	}

	async submitWorkText(text: string): Promise<ApplicationSnapshot> {
		const normalized = text.trim();
		if (!normalized) throw new Error("工作描述不能为空");
		if (!this.#options.submitText) throw new Error("工作理解服务尚未就绪");
		this.#snapshot = await this.#options.submitText(normalized);
		return this.getSnapshot();
	}

	async runCommand(command: UiCommand): Promise<ApplicationSnapshot> {
		if (!this.#options.runCommand) throw new Error("当前没有可操作的工作计划");
		this.#snapshot = await this.#options.runCommand(command);
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
}
