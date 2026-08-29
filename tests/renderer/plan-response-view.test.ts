import assert from "node:assert/strict";
import test from "node:test";

import { emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import { toPlanResponseText } from "../../src/renderer/plan-response-view.js";
import { basicWorkNodeDetail } from "../../src/work/types.js";

const profile = {
	timezone: "Asia/Shanghai",
	workdayStart: "09:30",
	workdayEnd: "18:00",
	dailyCapacityMinutes: 420,
	bufferPercent: 20,
	confirmed: true,
} as const;

const goal = {
	id: "goal-1",
	title: "活动筹备与晋升材料提交",
	description: "",
	deadline: "2026-09-08T18:00:00+08:00",
	milestones: [],
	status: "active" as const,
	createdAt: "2026-08-31T09:00:00+08:00",
	updatedAt: "2026-08-31T09:00:00+08:00",
};

const activityDetail = {
	...basicWorkNodeDetail("输出活动初稿方案"),
	steps: ["写明活动目标、流程、目标人群和物料清单"],
	successCriteria: ["形成可以交给上级预审的活动方案"],
	suggestions: ["先完成最小可审版本，不在初稿阶段美化"],
	contingencies: [{
		risk: "上级当天无法审阅",
		trigger: "下午仍未确认反馈时间",
		action: "主动确认最晚反馈时间，并预留次日修改窗口",
	}],
};

const initialSnapshot = {
	...emptyApplicationSnapshot(),
	goal,
	profile,
	nodes: [{
		id: "activity",
		goalId: goal.id,
		title: "输出活动初稿方案",
		owner: "self",
		workMinutes: 60,
		waitMinutes: 0,
		dependencyIds: [],
		status: "ready" as const,
		detail: activityDetail,
	}, {
		id: "promotion",
		goalId: goal.id,
		title: "归集晋升成果素材",
		owner: "self",
		workMinutes: 90,
		waitMinutes: 0,
		dependencyIds: ["activity"],
		status: "planned" as const,
		detail: basicWorkNodeDetail("归集晋升成果素材"),
	}],
	decisions: [{
		nodeId: "activity",
		title: "输出活动初稿方案",
		latestStart: "2026-08-31T10:00:00+08:00",
		scheduledStart: "2026-08-31T10:00:00+08:00",
		scheduledEnd: "2026-08-31T11:00:00+08:00",
		targetAt: "2026-09-04T18:00:00+08:00",
		recommendedAction: "start" as const,
		risk: "medium" as const,
		reason: "需要为预审和修改预留时间",
	}, {
		nodeId: "promotion",
		title: "归集晋升成果素材",
		latestStart: "2026-09-01T14:00:00+08:00",
		scheduledStart: "2026-09-01T14:00:00+08:00",
		scheduledEnd: "2026-09-01T15:30:00+08:00",
		targetAt: goal.deadline,
		recommendedAction: "later" as const,
		risk: "low" as const,
		reason: "先完成活动方案",
	}],
};

test("首次安排展示首个工作日的详细时段、预案和后续去向", () => {
	const text = toPlanResponseText(initialSnapshot, emptyApplicationSnapshot(), "2026-08-31T09:00:00+08:00");

	assert.match(text, /好的，我已经/);
	assert.match(text, /周一（今日/);
	assert.match(text, /上午/);
	assert.match(text, /10:00-11:00：输出活动初稿方案/);
	assert.match(text, /写明活动目标、流程、目标人群和物料清单/);
	assert.match(text, /预案：上级当天无法审阅/);
	assert.match(text, /周二到后续工作日安排已经放入主页中/);
});

test("临时任务插入后说明优先级、顺延任务和真实取舍", () => {
	const urgentDetail = {
		...basicWorkNodeDetail("完成全员用户群文案"),
		suggestions: ["复用历史文案，先给上级多版文本选择"],
	};
	const revised = {
		...initialSnapshot,
		nodes: [{
			id: "urgent",
			goalId: goal.id,
			title: "完成全员用户群文案",
			owner: "self",
			workMinutes: 80,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
			detail: urgentDetail,
		}, {
			id: "added-later",
			goalId: goal.id,
			title: "整理下周例会问题",
			owner: "self",
			workMinutes: 30,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
			detail: basicWorkNodeDetail("整理下周例会问题"),
		}, ...initialSnapshot.nodes],
		decisions: [{
			nodeId: "urgent",
			title: "完成全员用户群文案",
			latestStart: "2026-08-31T11:20:00+08:00",
			scheduledStart: "2026-08-31T10:00:00+08:00",
			scheduledEnd: "2026-08-31T11:20:00+08:00",
			targetAt: "2026-08-31T15:00:00+08:00",
			recommendedAction: "start" as const,
			risk: "medium" as const,
			reason: "今天对外发布且需要上级审核",
		}, {
			...initialSnapshot.decisions[0]!,
			scheduledStart: "2026-08-31T14:10:00+08:00",
			scheduledEnd: "2026-08-31T15:10:00+08:00",
		}, {
			nodeId: "added-later",
			title: "整理下周例会问题",
			latestStart: "2026-09-04T16:00:00+08:00",
			scheduledStart: "2026-08-31T16:00:00+08:00",
			scheduledEnd: "2026-08-31T16:30:00+08:00",
			targetAt: "2026-09-04T18:00:00+08:00",
			recommendedAction: "later" as const,
			risk: "low" as const,
			reason: "下周例会前完成即可",
		}],
	};

	const text = toPlanResponseText(revised, initialSnapshot, "2026-08-31T09:00:00+08:00");

	assert.match(text, /已把“完成全员用户群文案”作为紧急任务插入/);
	assert.match(text, /紧急临时任务插队 \+ 原有任务顺延补位/);
	assert.match(text, /10:00-11:20【最高优·紧急插队任务】：完成全员用户群文案/);
	assert.match(text, /14:10-15:10【顺延补位】：输出活动初稿方案/);
	assert.match(text, /16:00-16:30【新增任务】：整理下周例会问题/);
	assert.doesNotMatch(text, /已把“[^”]*整理下周例会问题[^”]*”作为紧急任务/);
	assert.match(text, /无虚假多线程并行/);
	assert.match(text, /本次排期排布合理性说明/);
	assert.match(text, /原有任务顺延/);
});

test("普通新增事项不虚报紧急，也不把时间未变的旧任务称为顺延", () => {
	const added = {
		...initialSnapshot,
		nodes: [...initialSnapshot.nodes, {
			id: "added",
			goalId: goal.id,
			title: "整理下周例会问题",
			owner: "self",
			workMinutes: 30,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
			detail: basicWorkNodeDetail("整理下周例会问题"),
		}],
		decisions: [...initialSnapshot.decisions, {
			nodeId: "added",
			title: "整理下周例会问题",
			latestStart: "2026-08-31T16:00:00+08:00",
			scheduledStart: "2026-09-01T16:00:00+08:00",
			scheduledEnd: "2026-09-01T16:30:00+08:00",
			targetAt: "2026-09-04T18:00:00+08:00",
			recommendedAction: "later" as const,
			risk: "low" as const,
			reason: "下周例会前完成即可",
		}],
	};

	const text = toPlanResponseText(added, initialSnapshot, "2026-08-31T09:00:00+08:00");

	assert.match(text, /已加入“整理下周例会问题”并重新安排/);
	assert.doesNotMatch(text, /紧急任务|最高优/);
	assert.doesNotMatch(text, /顺延补位|原有任务顺延/);
	assert.match(text, /其余工作日安排已经放入主页中/);
	assert.doesNotMatch(text, /周一到后续工作日/);
});

test("失败终态不会作为零时长事项出现在秘书回复中", () => {
	const snapshot = {
		...initialSnapshot,
		nodes: [...initialSnapshot.nodes, {
			id: "failed",
			goalId: goal.id,
			title: "已经失败的旧事项",
			owner: "self",
			workMinutes: 30,
			waitMinutes: 0,
			dependencyIds: [],
			status: "failed" as const,
			detail: basicWorkNodeDetail("已经失败的旧事项"),
		}],
		decisions: [...initialSnapshot.decisions, {
			nodeId: "failed",
			title: "已经失败的旧事项",
			latestStart: "2026-08-31T09:00:00+08:00",
			scheduledStart: "2026-08-31T09:00:00+08:00",
			scheduledEnd: "2026-08-31T09:00:00+08:00",
			targetAt: goal.deadline,
			recommendedAction: "stop" as const,
			risk: "high" as const,
			reason: "执行失败",
		}],
	};

	assert.doesNotMatch(toPlanResponseText(snapshot), /已经失败的旧事项/);
});

test("跨日任务首段不变但后续分段推迟时仍识别为顺延", () => {
	const previous = {
		...initialSnapshot,
		decisions: [{
			...initialSnapshot.decisions[0]!,
			scheduledEnd: "2026-09-01T11:00:00+08:00",
			scheduledSegments: [{
				scheduledStart: "2026-08-31T10:00:00+08:00",
				scheduledEnd: "2026-08-31T11:00:00+08:00",
			}, {
				scheduledStart: "2026-09-01T10:00:00+08:00",
				scheduledEnd: "2026-09-01T11:00:00+08:00",
			}],
		}, initialSnapshot.decisions[1]!],
	};
	const revised = {
		...previous,
		nodes: [...previous.nodes, {
			id: "urgent",
			goalId: goal.id,
			title: "完成全员用户群文案",
			owner: "self",
			workMinutes: 80,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
			detail: basicWorkNodeDetail("完成全员用户群文案"),
		}],
		decisions: [{
			...previous.decisions[0]!,
			scheduledEnd: "2026-09-01T15:00:00+08:00",
			scheduledSegments: [{
				scheduledStart: "2026-08-31T10:00:00+08:00",
				scheduledEnd: "2026-08-31T11:00:00+08:00",
			}, {
				scheduledStart: "2026-09-01T14:00:00+08:00",
				scheduledEnd: "2026-09-01T15:00:00+08:00",
			}],
		}, previous.decisions[1]!, {
			nodeId: "urgent",
			title: "完成全员用户群文案",
			latestStart: "2026-08-31T13:00:00+08:00",
			scheduledStart: "2026-08-31T11:00:00+08:00",
			scheduledEnd: "2026-08-31T12:00:00+08:00",
			targetAt: "2026-08-31T15:00:00+08:00",
			recommendedAction: "start" as const,
			risk: "medium" as const,
			reason: "当日发布",
		}],
	};

	const text = toPlanResponseText(revised, previous, "2026-08-31T09:00:00+08:00");

	assert.match(text, /10:00-11:00【顺延补位】：输出活动初稿方案/);
	assert.match(text, /原有任务顺延/);
});
