import type { WorkGoal, WorkNode, WorkNodeStatus } from "./types.js";

const allowedTransitions: Readonly<Record<WorkNodeStatus, readonly WorkNodeStatus[]>> = {
	planned: ["ready", "stopped"],
	ready: ["running", "waiting", "failed", "stopped"],
	running: ["waiting", "review", "failed", "stopped"],
	waiting: ["ready", "running", "failed", "stopped"],
	review: ["running", "done", "failed", "stopped"],
	done: [],
	stopped: [],
	failed: ["ready", "stopped"],
};

const statusLabel: Readonly<Record<WorkNodeStatus, string>> = {
	planned: "计划中",
	ready: "可开始",
	running: "执行中",
	waiting: "等待中",
	review: "待验收",
	done: "已完成",
	stopped: "已停止",
	failed: "失败",
};

export class WorkGraph {
	readonly goal: WorkGoal;
	readonly nodes: readonly WorkNode[];
	readonly #nodeById: ReadonlyMap<string, WorkNode>;
	readonly #topologicalIds: readonly string[];

	private constructor(goal: WorkGoal, nodes: readonly WorkNode[], topologicalIds: readonly string[]) {
		this.goal = { ...goal, milestones: goal.milestones.map((milestone) => ({ ...milestone })) };
		this.nodes = nodes.map((workNode) => ({ ...workNode, dependencyIds: [...workNode.dependencyIds] }));
		this.#nodeById = new Map(this.nodes.map((workNode) => [workNode.id, workNode]));
		this.#topologicalIds = [...topologicalIds];
	}

	static create(goal: WorkGoal, nodes: readonly WorkNode[]): WorkGraph {
		const nodeById = new Map<string, WorkNode>();
		for (const workNode of nodes) {
			if (!workNode.id.trim()) throw new Error("工作节点标识不能为空");
			if (nodeById.has(workNode.id)) throw new Error(`工作节点标识重复：${workNode.id}`);
			if (workNode.goalId !== goal.id) throw new Error(`工作节点 ${workNode.id} 不属于目标 ${goal.id}`);
			nodeById.set(workNode.id, workNode);
		}

		const indegree = new Map<string, number>(nodes.map((workNode) => [workNode.id, 0]));
		const dependents = new Map<string, string[]>(nodes.map((workNode) => [workNode.id, []]));
		for (const workNode of nodes) {
			const uniqueDependencies = new Set(workNode.dependencyIds);
			if (uniqueDependencies.size !== workNode.dependencyIds.length) {
				throw new Error(`工作节点 ${workNode.id} 包含重复依赖`);
			}
			for (const dependencyId of workNode.dependencyIds) {
				if (!nodeById.has(dependencyId)) throw new Error(`工作节点 ${workNode.id} 引用了不存在的依赖 ${dependencyId}`);
				if (dependencyId === workNode.id) throw new Error(`工作节点 ${workNode.id} 不能依赖自身`);
				indegree.set(workNode.id, (indegree.get(workNode.id) ?? 0) + 1);
				dependents.get(dependencyId)?.push(workNode.id);
			}
		}

		const queue = nodes.filter((workNode) => indegree.get(workNode.id) === 0).map((workNode) => workNode.id);
		const topologicalIds: string[] = [];
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;
			topologicalIds.push(current);
			for (const dependentId of dependents.get(current) ?? []) {
				const nextDegree = (indegree.get(dependentId) ?? 0) - 1;
				indegree.set(dependentId, nextDegree);
				if (nextDegree === 0) queue.push(dependentId);
			}
		}
		if (topologicalIds.length !== nodes.length) throw new Error("工作图包含循环依赖");

		return new WorkGraph(goal, nodes, topologicalIds);
	}

	node(nodeId: string): WorkNode {
		const workNode = this.#nodeById.get(nodeId);
		if (!workNode) throw new Error(`找不到工作节点：${nodeId}`);
		return workNode;
	}

	descendantsOf(nodeId: string): readonly string[] {
		this.node(nodeId);
		const descendants = new Set<string>();
		const queue = [nodeId];
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;
			for (const candidate of this.nodes) {
				if (!candidate.dependencyIds.includes(current) || descendants.has(candidate.id)) continue;
				descendants.add(candidate.id);
				queue.push(candidate.id);
			}
		}
		return this.#topologicalIds.filter((id) => descendants.has(id));
	}

	changeOwner(nodeId: string, owner: string): WorkGraph {
		if (!owner.trim()) throw new Error("负责人不能为空");
		this.node(nodeId);
		return this.#replace(nodeId, (workNode) => ({ ...workNode, owner: owner.trim() }));
	}

	stopNodes(nodeIds: readonly string[]): WorkGraph {
		const targets = new Set(nodeIds);
		for (const nodeId of targets) this.node(nodeId);
		return WorkGraph.create(
			this.goal,
			this.nodes.map((workNode) => targets.has(workNode.id) ? { ...workNode, status: "stopped" } : workNode),
		);
	}

	transitionNode(nodeId: string, target: WorkNodeStatus): WorkGraph {
		const current = this.node(nodeId);
		if (!allowedTransitions[current.status].includes(target)) {
			throw new Error(`不允许从${statusLabel[current.status]}变更为${statusLabel[target]}`);
		}
		return this.#replace(nodeId, (workNode) => ({ ...workNode, status: target }));
	}

	completeNode(nodeId: string): WorkGraph {
		const completed = this.transitionNode(nodeId, "done");
		return WorkGraph.create(
			completed.goal,
			completed.nodes.map((node) => {
				if (node.status !== "planned") return node;
				const dependenciesComplete = node.dependencyIds.every((dependencyId) => {
					const status = completed.node(dependencyId).status;
					return status === "done" || status === "stopped";
				});
				return dependenciesComplete ? { ...node, status: "ready" } : node;
			}),
		);
	}

	#replace(nodeId: string, mutate: (workNode: WorkNode) => WorkNode): WorkGraph {
		return WorkGraph.create(
			this.goal,
			this.nodes.map((workNode) => workNode.id === nodeId ? mutate(workNode) : workNode),
		);
	}
}
