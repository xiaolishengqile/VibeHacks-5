import type { WorkGraph } from "./graph.js";
import { subtractCalendarMinutes, subtractWorkingMinutes } from "./schedule.js";
import type { Milestone, WorkNode, WorkProfile } from "./types.js";

export type RecommendedAction = "start" | "continue" | "wait" | "stop" | "later";
export type DecisionRisk = "low" | "medium" | "high";

export interface WorkDecision {
	readonly nodeId: string;
	readonly title: string;
	readonly latestStart: string;
	readonly targetAt: string;
	readonly recommendedAction: RecommendedAction;
	readonly risk: DecisionRisk;
	readonly reason: string;
}

interface Target {
	readonly at: string;
	readonly label: string;
}

const earliestTargetFor = (node: WorkNode, deadline: string, milestones: readonly Milestone[]): Target => {
	const candidates = milestones
		.filter((milestone) => milestone.nodeIds.includes(node.id))
		.map((milestone) => ({ at: milestone.at, label: milestone.title }));
	candidates.push({ at: deadline, label: "最终截止" });
	return candidates.sort((left, right) => Date.parse(left.at) - Date.parse(right.at))[0]
		?? { at: deadline, label: "最终截止" };
};

export class DecisionEngine {
	replan(graph: WorkGraph, profile: WorkProfile, now: string): readonly WorkDecision[] {
		if (!profile.bufferPercent.confirmed) throw new Error("安全缓冲尚未确认");
		const nowMs = Date.parse(now);
		if (Number.isNaN(nowMs)) throw new Error("当前时间无效");

		const decisions = graph.nodes.map((node) => {
			const target = earliestTargetFor(node, graph.goal.deadline, graph.goal.milestones);
			const afterWaiting = subtractCalendarMinutes(target.at, node.waitMinutes);
			const bufferMinutes = Math.ceil(node.workMinutes * profile.bufferPercent.value / 100);
			const latestStart = subtractWorkingMinutes(afterWaiting, node.workMinutes + bufferMinutes, profile);
			const incompleteDependencies = node.dependencyIds.filter((dependencyId) => {
				const status = graph.node(dependencyId).status;
				return status !== "done" && status !== "stopped";
			});
			const slackMinutes = Math.floor((Date.parse(latestStart) - nowMs) / 60_000);
			const recommendedAction = this.#action(node, incompleteDependencies.length > 0, slackMinutes);
			const risk: DecisionRisk = slackMinutes <= 0
				? "high"
				: slackMinutes < profile.dailyCapacityMinutes.value ? "medium" : "low";
			const reasons = [
				`目标为${target.label} ${target.at}`,
				`预计工作 ${node.workMinutes} 分钟`,
				`外部等待 ${node.waitMinutes} 分钟`,
				`安全缓冲 ${bufferMinutes} 分钟`,
				`最晚开始 ${latestStart}`,
			];
			if (node.workMinutes + bufferMinutes > profile.dailyCapacityMinutes.value) {
				reasons.push(`所需时间超过每日容量 ${profile.dailyCapacityMinutes.value} 分钟`);
			}
			if (incompleteDependencies.length > 0) {
				reasons.push(`依赖 ${incompleteDependencies.map((id) => graph.node(id).title).join("、")} 尚未完成`);
			}
			return {
				nodeId: node.id,
				title: node.title,
				latestStart,
				targetAt: target.at,
				recommendedAction,
				risk,
				reason: reasons.join("；"),
				priority: this.#priority(node, incompleteDependencies.length > 0, slackMinutes),
			};
		});

		return decisions
			.sort((left, right) => left.priority - right.priority)
			.map(({ priority: _priority, ...decision }) => decision);
	}

	#action(node: WorkNode, blocked: boolean, slackMinutes: number): RecommendedAction {
		if (node.status === "done" || node.status === "stopped") return "stop";
		if (node.status === "running") return "continue";
		if (node.status === "waiting" || blocked) return "wait";
		if (node.status === "failed") return "stop";
		if (node.status === "ready" || slackMinutes <= 0) return "start";
		return "later";
	}

	#priority(node: WorkNode, blocked: boolean, slackMinutes: number): number {
		if (!blocked && (node.owner !== "self" || node.waitMinutes > 0)) return -1_000_000 + slackMinutes;
		if (slackMinutes <= 0) return -500_000 + slackMinutes;
		if (blocked) return 1_000_000 + slackMinutes;
		return slackMinutes;
	}
}
