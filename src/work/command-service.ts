import type { IdGenerator } from "../shared/ids.js";
import type { DecisionEngine, WorkDecision } from "./decision-engine.js";
import { WorkGraph } from "./graph.js";
import { confirmProfile as confirmWorkProfile, isProfileConfirmed, recordDurationObservation } from "./profile.js";
import type {
	Clock,
	StoredWorkAggregate,
	WorkChange,
	WorkChangeKind,
	WorkRepository,
} from "./repositories.js";
import { basicWorkNodeDetail, type WorkDraft, type WorkGoal, type WorkNode, type WorkProfile } from "./types.js";
import { validateFixedSchedule } from "./forward-schedule.js";
import { addCalendarMinutes, isWithinWorkday } from "./schedule.js";

export interface LoadedAggregate {
	readonly profile: WorkProfile;
	readonly graph: WorkGraph;
	readonly changes: readonly WorkChange[];
}

export interface CommandState {
	readonly aggregate: LoadedAggregate;
	readonly decisions: readonly WorkDecision[];
}

export interface CommandResult extends CommandState {
	readonly change: WorkChange;
}

interface StopConfirmation {
	readonly goalId: string;
	readonly nodeIds: readonly string[];
	readonly expiresAt: number;
}

const normalizeManualTodo = (input: { readonly title: string; readonly at: string; readonly durationMinutes: number }): {
	readonly title: string;
	readonly at: string;
	readonly durationMinutes: number;
} => {
	const title = input.title.trim();
	if (!title) throw new Error("待办内容不能为空");
	if (Number.isNaN(Date.parse(input.at))) throw new Error("待办时间无效");
	if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 540) {
		throw new Error("待办时长必须是 1 到 540 分钟的整数");
	}
	return { title, at: input.at, durationMinutes: input.durationMinutes };
};

export class CommandService {
	readonly #stopConfirmations = new Map<string, StopConfirmation>();
	readonly #repository: WorkRepository;
	readonly #decisionEngine: DecisionEngine;
	readonly #ids: IdGenerator;
	readonly #clock: Clock;

	constructor(
		repository: WorkRepository,
		decisionEngine: DecisionEngine,
		ids: IdGenerator,
		clock: Clock,
	) {
		this.#repository = repository;
		this.#decisionEngine = decisionEngine;
		this.#ids = ids;
		this.#clock = clock;
	}

	async createFromDraft(input: { readonly profile: WorkProfile; readonly draft: WorkDraft }): Promise<CommandResult> {
		const now = this.#clock.now();
		const goalId = this.#ids.next("goal");
		const nodeIds = input.draft.nodes.map(() => this.#ids.next("node"));
		const nodes: WorkNode[] = input.draft.nodes.map((draftNode, index) => ({
			id: nodeIds[index]!,
			goalId,
			title: draftNode.title,
			owner: draftNode.owner,
			workMinutes: draftNode.workMinutes,
			waitMinutes: draftNode.waitMinutes,
			detail: draftNode.detail,
			dependencyIds: draftNode.dependencyIndexes.map((dependencyIndex) => nodeIds[dependencyIndex]!),
			status: draftNode.dependencyIndexes.length === 0 ? "ready" : "planned",
			...(draftNode.potentialCollaborator ? { potentialCollaborator: draftNode.potentialCollaborator } : {}),
		}));
		const goal: WorkGoal = {
			id: goalId,
			title: input.draft.title,
			description: input.draft.assumptions.join("；"),
			deadline: input.draft.deadline,
			milestones: input.draft.milestones.map((milestone) => ({
				id: this.#ids.next("milestone"),
				title: milestone.title,
				at: milestone.at,
				nodeIds: milestone.nodeIndexes.map((nodeIndex) => nodeIds[nodeIndex]!),
			})),
			status: "active",
			createdAt: now,
			updatedAt: now,
		};
		const graph = WorkGraph.create(goal, nodes);
		const change = this.#change("created", `创建工作目标：${goal.title}`);
		return this.#save({ profile: input.profile, graph, changes: [change] }, change);
	}

	async reviseFromDraft(input: { readonly goalId: string; readonly draft: WorkDraft }): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		const nonTerminalNodes = aggregate.graph.nodes.filter((node) =>
			node.status !== "done" && node.status !== "stopped" && node.status !== "failed");
		const existingById = new Map(nonTerminalNodes.map((node) => [node.id, node]));
		const sourceIds = new Set<string>();
		for (const draftNode of input.draft.nodes) {
			if (!draftNode.sourceNodeId) continue;
			if (!existingById.has(draftNode.sourceNodeId)) {
				throw new Error(`草稿来源不属于当前可重排节点：${draftNode.sourceNodeId}`);
			}
			if (sourceIds.has(draftNode.sourceNodeId)) {
				throw new Error(`草稿来源重复：${draftNode.sourceNodeId}`);
			}
			sourceIds.add(draftNode.sourceNodeId);
		}
		if (sourceIds.size !== existingById.size) throw new Error("草稿遗漏了当前可重排节点");

		const nodeIds = input.draft.nodes.map((node) => node.sourceNodeId ?? this.#ids.next("node"));
		const nodes: WorkNode[] = input.draft.nodes.map((draftNode, index) => {
			const existing = draftNode.sourceNodeId ? existingById.get(draftNode.sourceNodeId) : undefined;
			return {
				id: nodeIds[index]!,
				goalId: aggregate.graph.goal.id,
				title: draftNode.title,
				owner: draftNode.owner,
				workMinutes: draftNode.workMinutes,
				waitMinutes: draftNode.waitMinutes,
				detail: draftNode.detail,
				dependencyIds: draftNode.dependencyIndexes.map((dependencyIndex) => nodeIds[dependencyIndex]!),
				status: existing?.status ?? (draftNode.dependencyIndexes.length === 0 ? "ready" : "planned"),
				...(draftNode.potentialCollaborator ? { potentialCollaborator: draftNode.potentialCollaborator } : {}),
				...(existing?.actualMinutes === undefined ? {} : { actualMinutes: existing.actualMinutes }),
				...(existing?.fixedStart ? { fixedStart: existing.fixedStart } : {}),
			};
		});
		const terminalNodes = aggregate.graph.nodes.filter((node) =>
			node.status === "done" || node.status === "stopped" || node.status === "failed");
		const goal: WorkGoal = {
			...aggregate.graph.goal,
			title: input.draft.title,
			description: input.draft.assumptions.join("；"),
			deadline: input.draft.deadline,
			milestones: input.draft.milestones.map((milestone) => ({
				id: this.#ids.next("milestone"),
				title: milestone.title,
				at: milestone.at,
				nodeIds: milestone.nodeIndexes.map((nodeIndex) => nodeIds[nodeIndex]!),
			})),
			updatedAt: this.#clock.now(),
		};
		const graph = WorkGraph.create(goal, [...nodes, ...terminalNodes]);
		const change = this.#change("replanned", `重排工作目标：${goal.title}`);
		return this.#save({ ...aggregate, graph }, change);
	}

	async read(goalId: string): Promise<CommandState> {
		return this.#state(await this.#load(goalId));
	}

	async readLatest(): Promise<CommandState | null> {
		const stored = await this.#repository.loadLatestAggregate();
		return stored ? this.#state(this.#fromStored(stored)) : null;
	}

	async confirmProfile(input: { readonly goalId: string }): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		if (isProfileConfirmed(aggregate.profile)) throw new Error("个人工作习惯已经确认");
		const profile = confirmWorkProfile(aggregate.profile, this.#clock.now());
		const change = this.#change("profileConfirmed", "确认个人工作习惯和排期参数");
		return this.#save({ ...aggregate, profile }, change);
	}

	async changeDeadline(input: { readonly goalId: string; readonly deadline: string }): Promise<CommandResult> {
		if (Number.isNaN(Date.parse(input.deadline))) throw new Error("新的截止时间无效");
		const aggregate = await this.#load(input.goalId);
		const oldDeadline = aggregate.graph.goal.deadline;
		const goal = { ...aggregate.graph.goal, deadline: input.deadline, updatedAt: this.#clock.now() };
		const change = this.#change("deadlineChanged", `截止时间由 ${oldDeadline} 变更为 ${input.deadline}`);
		return this.#save({ ...aggregate, graph: WorkGraph.create(goal, aggregate.graph.nodes) }, change);
	}

	async changeMilestone(input: {
		readonly goalId: string;
		readonly milestoneId: string;
		readonly at: string;
	}): Promise<CommandResult> {
		if (Number.isNaN(Date.parse(input.at))) throw new Error("新的里程碑时间无效");
		const aggregate = await this.#load(input.goalId);
		const current = aggregate.graph.goal.milestones.find((item) => item.id === input.milestoneId);
		if (!current) throw new Error(`找不到里程碑：${input.milestoneId}`);
		const goal = {
			...aggregate.graph.goal,
			milestones: aggregate.graph.goal.milestones.map((item) =>
				item.id === input.milestoneId ? { ...item, at: input.at } : item),
			updatedAt: this.#clock.now(),
		};
		const change = this.#change(
			"milestoneChanged",
			`${current.title}由 ${current.at} 变更为 ${input.at}`,
		);
		return this.#save({ ...aggregate, graph: WorkGraph.create(goal, aggregate.graph.nodes) }, change);
	}

	async addManualTodo(input: {
		readonly profile: WorkProfile;
		readonly goalId?: string | null;
		readonly title: string;
		readonly at: string;
		readonly durationMinutes: number;
	}): Promise<CommandResult> {
		const todo = normalizeManualTodo(input);
		const aggregate = input.goalId
			? await this.#load(input.goalId)
			: this.#manualTodoAggregate(input.profile, todo);
		if (!isWithinWorkday(todo.at, aggregate.profile)) {
			throw new Error("周六周日不安排工作，待办只能放在个人工作时段内");
		}
		const nodeId = this.#ids.next("node");
		const milestoneId = this.#ids.next("milestone");
		const now = this.#clock.now();
		const endsAt = addCalendarMinutes(todo.at, todo.durationMinutes);
		const node: WorkNode = {
			id: nodeId,
			goalId: aggregate.graph.goal.id,
			title: todo.title,
			owner: "self",
			workMinutes: todo.durationMinutes,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready",
			fixedStart: todo.at,
			detail: basicWorkNodeDetail(todo.title),
		};
		const goal: WorkGoal = {
			...aggregate.graph.goal,
			deadline: Date.parse(endsAt) > Date.parse(aggregate.graph.goal.deadline) ? endsAt : aggregate.graph.goal.deadline,
			milestones: [...aggregate.graph.goal.milestones, {
				id: milestoneId,
				title: todo.title,
				at: endsAt,
				nodeIds: [nodeId],
			}],
			updatedAt: now,
		};
		const graph = WorkGraph.create(goal, [...aggregate.graph.nodes, node]);
		validateFixedSchedule(graph.nodes, aggregate.profile);
		const change = this.#change("todoAdded", `添加手动待办：${todo.title}`);
		return this.#save({ ...aggregate, graph }, change);
	}

	async changeOwner(input: {
		readonly goalId: string;
		readonly nodeId: string;
		readonly owner: string;
	}): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		const oldOwner = aggregate.graph.node(input.nodeId).owner;
		const graph = aggregate.graph.changeOwner(input.nodeId, input.owner);
		const change = this.#change("ownerChanged", `协作方由${oldOwner}变更为${input.owner.trim()}`);
		return this.#save({ ...aggregate, graph }, change);
	}

	async prepareStop(input: { readonly goalId: string; readonly nodeId: string }): Promise<{
		readonly token: string;
		readonly affectedNodeIds: readonly string[];
	}> {
		const aggregate = await this.#load(input.goalId);
		const nodeIds = [input.nodeId, ...aggregate.graph.descendantsOf(input.nodeId)];
		const token = this.#ids.next("stop");
		this.#stopConfirmations.set(token, {
			goalId: input.goalId,
			nodeIds,
			expiresAt: Date.parse(this.#clock.now()) + 5 * 60_000,
		});
		return { token, affectedNodeIds: nodeIds };
	}

	async confirmStop(input: { readonly goalId: string; readonly token: string }): Promise<CommandResult> {
		const confirmation = this.#stopConfirmations.get(input.token);
		this.#stopConfirmations.delete(input.token);
		if (
			!confirmation
			|| confirmation.goalId !== input.goalId
			|| Date.parse(this.#clock.now()) > confirmation.expiresAt
		) {
			throw new Error("停止确认已失效");
		}
		const aggregate = await this.#load(input.goalId);
		const graph = aggregate.graph.stopNodes(confirmation.nodeIds);
		const change = this.#change("stopped", `停止 ${confirmation.nodeIds.length} 个关联工作节点`);
		return this.#save({ ...aggregate, graph }, change);
	}

	async recordActualDuration(input: {
		readonly goalId: string;
		readonly nodeId: string;
		readonly actualMinutes: number;
	}): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		const node = aggregate.graph.node(input.nodeId);
		const profile = recordDurationObservation(aggregate.profile, {
			taskType: node.title,
			estimatedMinutes: node.workMinutes,
			actualMinutes: input.actualMinutes,
			sourceWorkNodeId: node.id,
			observedAt: this.#clock.now(),
		});
		const nodes = aggregate.graph.nodes.map((item) =>
			item.id === input.nodeId ? { ...item, actualMinutes: input.actualMinutes } : item);
		const graph = WorkGraph.create(aggregate.graph.goal, nodes);
		const change = this.#change("durationRecorded", `记录${node.title}实际耗时 ${input.actualMinutes} 分钟`);
		return this.#save({ profile, graph, changes: aggregate.changes }, change);
	}

	async acceptArtifact(input: {
		readonly goalId: string;
		readonly nodeId: string;
		readonly artifactId: string;
	}): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		const graph = aggregate.graph.completeNode(input.nodeId);
		const change = this.#change("artifactAccepted", `接受成果 ${input.artifactId}`);
		return this.#save({ ...aggregate, graph }, change);
	}

	async startExecution(input: { readonly goalId: string; readonly nodeId: string }): Promise<CommandResult> {
		return this.#transitionForExecution(
			input,
			"running",
			"executionStarted",
			"执行代理开始处理工作节点",
		);
	}

	async submitForReview(input: { readonly goalId: string; readonly nodeId: string }): Promise<CommandResult> {
		return this.#transitionForExecution(
			input,
			"review",
			"artifactReady",
			"成果验证通过，等待用户验收",
		);
	}

	async failExecution(input: {
		readonly goalId: string;
		readonly nodeId: string;
		readonly reason: string;
	}): Promise<CommandResult> {
		return this.#transitionForExecution(
			input,
			"failed",
			"executionFailed",
			`执行失败：${input.reason}`,
		);
	}

	async #transitionForExecution(
		input: { readonly goalId: string; readonly nodeId: string },
		target: "running" | "review" | "failed",
		kind: "executionStarted" | "artifactReady" | "executionFailed",
		reason: string,
	): Promise<CommandResult> {
		const aggregate = await this.#load(input.goalId);
		const graph = aggregate.graph.transitionNode(input.nodeId, target);
		const change = this.#change(kind, reason);
		return this.#save({ ...aggregate, graph }, change);
	}

	async #load(goalId: string): Promise<LoadedAggregate> {
		const stored = await this.#repository.loadAggregate(goalId);
		if (!stored) throw new Error(`找不到工作目标：${goalId}`);
		return this.#fromStored(stored);
	}

	#fromStored(stored: StoredWorkAggregate): LoadedAggregate {
		return {
			profile: stored.profile,
			graph: WorkGraph.create(stored.goal, stored.nodes),
			changes: stored.changes,
		};
	}

	#manualTodoAggregate(profile: WorkProfile, todo: { readonly title: string; readonly at: string; readonly durationMinutes: number }): LoadedAggregate {
		const now = this.#clock.now();
		const goal: WorkGoal = {
			id: this.#ids.next("goal"),
			title: "手动待办",
			description: "用户手动添加到日历的待办",
			deadline: todo.at,
			milestones: [],
			status: "active",
			createdAt: now,
			updatedAt: now,
		};
		return {
			profile,
			graph: WorkGraph.create(goal, []),
			changes: [],
		};
	}

	#state(aggregate: LoadedAggregate): CommandState {
		return {
			aggregate,
			decisions: isProfileConfirmed(aggregate.profile)
				? this.#decisionEngine.replan(aggregate.graph, aggregate.profile, this.#clock.now())
				: [],
		};
	}

	#change(kind: WorkChangeKind, reason: string): WorkChange {
		return { id: this.#ids.next("change"), kind, reason, createdAt: this.#clock.now() };
	}

	async #save(aggregate: LoadedAggregate, change: WorkChange): Promise<CommandResult> {
		const changes = aggregate.changes.at(-1)?.id === change.id
			? aggregate.changes
			: [...aggregate.changes, change];
		const stored: StoredWorkAggregate = {
			profile: aggregate.profile,
			goal: aggregate.graph.goal,
			nodes: aggregate.graph.nodes,
			changes,
		};
		const state = this.#state(this.#fromStored(stored));
		await this.#repository.saveAggregate(stored);
		return {
			...state,
			change,
		};
	}
}
