import assert from "node:assert/strict";
import test from "node:test";

import { emptyApplicationSnapshot } from "../../src/desktop/application-service.js";
import { toTaskDetailView } from "../../src/renderer/task-detail-view.js";

const decision = {
	nodeId: "deck",
	title: "撰写晋升材料",
	latestStart: "2026-09-02T13:00:00+08:00",
	scheduledStart: "2026-09-01T13:30:00+08:00",
	scheduledEnd: "2026-09-01T15:30:00+08:00",
	targetAt: "2026-09-04T18:00:00+08:00",
	recommendedAction: "start" as const,
	risk: "medium" as const,
	reason: "需要先形成可审阅文字稿",
};

test("任务详情保留生成排期时的专业建议和兜底", () => {
	const snapshot = {
		...emptyApplicationSnapshot(),
		nodes: [{
			id: "deck",
			goalId: "goal_1",
			title: "撰写晋升材料",
			owner: "self",
			workMinutes: 90,
			waitMinutes: 0,
			dependencyIds: ["data"],
			status: "ready" as const,
			detail: {
				summary: "先完成晋升故事线，再制作演示页面。",
				steps: ["汇总成果", "写完整叙事文稿"],
				deliverables: ["晋升材料文字稿"],
				successCriteria: ["背景、行动、结果和价值完整"],
				suggestions: ["先写文字叙事，再制作演示页面"],
				contingencies: [{
					risk: "关键数据缺失",
					trigger: "周三中午仍未拿到数据",
					action: "先使用占位和已有数据完成可审版本",
				}],
			},
		}, {
			id: "data",
			goalId: "goal_1",
			title: "回收项目数据",
			owner: "小王",
			workMinutes: 15,
			waitMinutes: 1440,
			dependencyIds: [],
			status: "waiting" as const,
		}],
		decisions: [decision],
	};

	const full = toTaskDetailView(snapshot, "deck");

	assert.deepEqual(full?.suggestions, ["先写文字叙事，再制作演示页面"]);
	assert.equal(full?.contingencies[0]?.trigger, "周三中午仍未拿到数据");
	assert.deepEqual(full?.dependencies, ["回收项目数据"]);
	assert.equal(full?.scheduledLabel, "9月1日 13:30—15:30");
	assert.equal((full as { scheduleTypeLabel?: string } | null)?.scheduleTypeLabel, "智能安排");
});

test("固定时间任务在详情中明确标识其排期类型", () => {
	const snapshot = {
		...emptyApplicationSnapshot(),
		nodes: [{
			id: "notes",
			goalId: "goal_1",
			title: "整理会议纪要",
			owner: "self",
			workMinutes: 45,
			waitMinutes: 0,
			dependencyIds: [],
			status: "ready" as const,
			fixedStart: "2026-09-01T10:00:00+08:00",
		}],
		decisions: [{ ...decision, nodeId: "notes", title: "整理会议纪要", scheduledStart: "2026-09-01T10:00:00+08:00", scheduledEnd: "2026-09-01T10:45:00+08:00" }],
	};

	const detail = toTaskDetailView(snapshot, "notes");

	assert.equal((detail as { scheduleTypeLabel?: string } | null)?.scheduleTypeLabel, "固定时间");
});

test("旧任务没有智能详情时仍生成可执行的基础说明", () => {
	const snapshot = {
		...emptyApplicationSnapshot(),
		nodes: [{
			id: "notes",
			goalId: "goal_1",
			title: "整理会议纪要",
			owner: "self",
			workMinutes: 30,
			waitMinutes: 0,
			dependencyIds: [],
			status: "planned" as const,
		}],
		decisions: [{
			...decision,
			nodeId: "notes",
			title: "整理会议纪要",
		}],
	};

	const fallback = toTaskDetailView(snapshot, "notes");

	assert.match(fallback?.summary ?? "", /整理会议纪要/);
	assert.equal((fallback?.contingencies.length ?? 0) > 0, true);
});
