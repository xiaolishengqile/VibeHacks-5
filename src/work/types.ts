import { err, ok, type Result } from "../shared/result.js";

export type WorkNodeStatus =
	| "planned"
	| "ready"
	| "running"
	| "waiting"
	| "review"
	| "done"
	| "stopped"
	| "failed";

export interface ConfirmedValue<T> {
	readonly value: T;
	readonly confirmed: boolean;
	readonly source: "user" | "inferred" | "observed";
	readonly updatedAt: string;
}

export interface DurationObservation {
	readonly taskType: string;
	readonly estimatedMinutes: number;
	readonly actualMinutes: number;
	readonly sourceWorkNodeId: string;
	readonly observedAt: string;
}

export interface WaitingObservation {
	readonly collaborator: string;
	readonly actualMinutes: number;
	readonly sourceWorkNodeId: string;
	readonly observedAt: string;
}

export interface WorkProfile {
	readonly id: string;
	readonly timezone: ConfirmedValue<string>;
	readonly workdayStart: ConfirmedValue<string>;
	readonly workdayEnd: ConfirmedValue<string>;
	readonly dailyCapacityMinutes: ConfirmedValue<number>;
	readonly bufferPercent: ConfirmedValue<number>;
	readonly durationObservations: readonly DurationObservation[];
	readonly waitingObservations: readonly WaitingObservation[];
}

export interface Milestone {
	readonly id: string;
	readonly title: string;
	readonly at: string;
	readonly nodeIds: readonly string[];
}

export interface WorkGoal {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly deadline: string;
	readonly milestones: readonly Milestone[];
	readonly status: "active" | "done" | "stopped";
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CollaboratorRef {
	readonly name: string;
	readonly confirmed: boolean;
}

export interface WorkContingency {
	readonly risk: string;
	readonly trigger: string;
	readonly action: string;
}

export interface WorkNodeDetail {
	readonly summary: string;
	readonly steps: readonly string[];
	readonly deliverables: readonly string[];
	readonly successCriteria: readonly string[];
	readonly suggestions: readonly string[];
	readonly contingencies: readonly WorkContingency[];
}

export const basicWorkNodeDetail = (title: string): WorkNodeDetail => ({
	summary: `完成「${title}」，并留下可检查的结果。`,
	steps: [`确认「${title}」的范围和所需资料`, `完成「${title}」并记录结果`],
	deliverables: [`「${title}」的完成结果`],
	successCriteria: ["结果可检查、可交付，未完成项已明确记录"],
	suggestions: ["先完成最小可交付版本，再补充细节"],
	contingencies: [{
		risk: "时间或资料不足",
		trigger: "开始时仍缺少完成任务所需的关键信息",
		action: "缩小范围，先交最小版本并标记待补内容",
	}],
});

export interface WorkNode {
	readonly id: string;
	readonly goalId: string;
	readonly title: string;
	readonly owner: string;
	readonly potentialCollaborator?: CollaboratorRef;
	readonly workMinutes: number;
	readonly waitMinutes: number;
	readonly dependencyIds: readonly string[];
	readonly status: WorkNodeStatus;
	readonly latestStart?: string;
	readonly fixedStart?: string;
	readonly actualMinutes?: number;
	readonly detail?: WorkNodeDetail;
}

export interface WorkDraftMilestone {
	readonly title: string;
	readonly at: string;
	readonly nodeIndexes: readonly number[];
}

export interface WorkDraftNode {
	readonly title: string;
	readonly owner: string;
	readonly workMinutes: number;
	readonly waitMinutes: number;
	readonly dependencyIndexes: readonly number[];
	readonly sourceNodeId?: string;
	readonly potentialCollaborator?: CollaboratorRef;
	readonly detail: WorkNodeDetail;
}

export interface WorkDraft {
	readonly title: string;
	readonly deadline: string;
	readonly milestones: readonly WorkDraftMilestone[];
	readonly nodes: readonly WorkDraftNode[];
	readonly assumptions: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const trimmed = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;

const validInstant = (value: unknown): value is string =>
	typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));

const nonNegativeInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= 0;

const detailStrings = (
	value: unknown,
	label: string,
	nodeIndex: number,
	errors: string[],
): readonly string[] | null => {
	const items = Array.isArray(value)
		? value.map(trimmed).filter((item): item is string => item !== null)
		: [];
	if (items.length === 0 || items.length !== (Array.isArray(value) ? value.length : 0)) {
		errors.push(`节点 ${nodeIndex + 1} 的${label}至少需要一项具体内容`);
		return null;
	}
	return items;
};

const workNodeDetail = (value: unknown, nodeIndex: number, errors: string[]): WorkNodeDetail | null => {
	if (!isRecord(value)) {
		errors.push(`节点 ${nodeIndex + 1} 缺少任务详情`);
		return null;
	}
	const summary = trimmed(value.summary);
	if (!summary) errors.push(`节点 ${nodeIndex + 1} 的任务说明不能为空`);
	const steps = detailStrings(value.steps, "执行步骤", nodeIndex, errors);
	const deliverables = detailStrings(value.deliverables, "交付物", nodeIndex, errors);
	const successCriteria = detailStrings(value.successCriteria, "完成标准", nodeIndex, errors);
	const suggestions = detailStrings(value.suggestions, "助理建议", nodeIndex, errors);
	const rawContingencies = Array.isArray(value.contingencies) ? value.contingencies : [];
	const contingencies: WorkContingency[] = [];
	if (rawContingencies.length === 0) errors.push(`节点 ${nodeIndex + 1} 至少需要一个风险兜底`);
	for (const [contingencyIndex, raw] of rawContingencies.entries()) {
		if (!isRecord(raw)) {
			errors.push(`节点 ${nodeIndex + 1} 的兜底 ${contingencyIndex + 1} 格式无效`);
			continue;
		}
		const risk = trimmed(raw.risk);
		const trigger = trimmed(raw.trigger);
		const action = trimmed(raw.action);
		if (!risk || !trigger || !action) {
			errors.push(`节点 ${nodeIndex + 1} 的兜底 ${contingencyIndex + 1} 必须包含风险、触发条件和行动`);
			continue;
		}
		contingencies.push({ risk, trigger, action });
	}
	return summary && steps && deliverables && successCriteria && suggestions
		&& contingencies.length === rawContingencies.length
		? { summary, steps, deliverables, successCriteria, suggestions, contingencies }
		: null;
};

export function validateWorkDraft(input: unknown): Result<WorkDraft, readonly string[]> {
	if (!isRecord(input)) {
		return err(["工作草稿必须是对象"]);
	}

	const errors: string[] = [];
	const title = trimmed(input.title);
	if (!title) errors.push("工作标题不能为空");
	if (!validInstant(input.deadline)) errors.push("截止时间无效");

	const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
	if (rawNodes.length === 0) errors.push("至少需要一个工作节点");
	const nodes: WorkDraftNode[] = [];

	for (const [index, rawNode] of rawNodes.entries()) {
		if (!isRecord(rawNode)) {
			errors.push(`节点 ${index + 1} 格式无效`);
			continue;
		}
		const nodeTitle = trimmed(rawNode.title);
		const owner = trimmed(rawNode.owner);
		if (!nodeTitle) errors.push(`节点 ${index + 1} 标题不能为空`);
		if (!owner) errors.push(`节点 ${index + 1} 负责人不能为空`);
		if (!nonNegativeInteger(rawNode.workMinutes)) errors.push(`节点 ${index + 1} 的工作量不能为负数`);
		if (!nonNegativeInteger(rawNode.waitMinutes)) errors.push(`节点 ${index + 1} 的等待时间不能为负数`);
		const sourceNodeId = rawNode.sourceNodeId === undefined ? undefined : trimmed(rawNode.sourceNodeId);
		if (rawNode.sourceNodeId !== undefined && !sourceNodeId) {
			errors.push(`节点 ${index + 1} 的来源标识不能为空`);
		}
		const detail = workNodeDetail(rawNode.detail, index, errors);

		const dependencyIndexes = Array.isArray(rawNode.dependencyIndexes)
			? rawNode.dependencyIndexes.filter((value): value is number => Number.isInteger(value))
			: [];
		for (const dependencyIndex of dependencyIndexes) {
			if (dependencyIndex < 0 || dependencyIndex >= rawNodes.length) {
				errors.push(`节点 ${index + 1} 包含越界依赖 ${dependencyIndex}`);
			} else if (dependencyIndex === index) {
				errors.push(`节点 ${index + 1} 不能依赖自身`);
			}
		}

		let potentialCollaborator: CollaboratorRef | undefined;
		if (rawNode.potentialCollaborator !== undefined) {
			if (!isRecord(rawNode.potentialCollaborator)) {
				errors.push(`节点 ${index + 1} 的潜在协作方格式无效`);
			} else {
				const name = trimmed(rawNode.potentialCollaborator.name);
				const confirmed = rawNode.potentialCollaborator.confirmed === true;
				if (!name) errors.push(`节点 ${index + 1} 的潜在协作方名称为空`);
				if (!confirmed) errors.push(`节点 ${index + 1} 的潜在协作方尚未确认`);
				if (name) potentialCollaborator = { name, confirmed };
			}
		}

		if (nodeTitle && owner && detail
			&& nonNegativeInteger(rawNode.workMinutes) && nonNegativeInteger(rawNode.waitMinutes)) {
			nodes.push({
				title: nodeTitle,
				owner,
				workMinutes: rawNode.workMinutes,
				waitMinutes: rawNode.waitMinutes,
				dependencyIndexes,
				detail,
				...(sourceNodeId ? { sourceNodeId } : {}),
				...(potentialCollaborator ? { potentialCollaborator } : {}),
			});
		}
	}

	const rawMilestones = Array.isArray(input.milestones) ? input.milestones : [];
	const milestones: WorkDraftMilestone[] = [];
	for (const [index, rawMilestone] of rawMilestones.entries()) {
		if (!isRecord(rawMilestone)) {
			errors.push(`里程碑 ${index + 1} 格式无效`);
			continue;
		}
		const milestoneTitle = trimmed(rawMilestone.title);
		if (!milestoneTitle) errors.push(`里程碑 ${index + 1} 标题不能为空`);
		if (!validInstant(rawMilestone.at)) errors.push(`里程碑 ${index + 1} 时间无效`);
		const nodeIndexes = Array.isArray(rawMilestone.nodeIndexes)
			? rawMilestone.nodeIndexes.filter((value): value is number => Number.isInteger(value))
			: [];
		for (const nodeIndex of nodeIndexes) {
			if (nodeIndex < 0 || nodeIndex >= rawNodes.length) {
				errors.push(`里程碑 ${index + 1} 包含越界节点 ${nodeIndex}`);
			}
		}
		if (milestoneTitle && validInstant(rawMilestone.at)) {
			milestones.push({ title: milestoneTitle, at: rawMilestone.at, nodeIndexes });
		}
	}

	const assumptions = Array.isArray(input.assumptions)
		? input.assumptions.map(trimmed).filter((value): value is string => value !== null)
		: [];

	if (errors.length > 0 || !title || !validInstant(input.deadline) || nodes.length !== rawNodes.length) {
		return err(errors);
	}

	return ok({ title, deadline: input.deadline, milestones, nodes, assumptions });
}
