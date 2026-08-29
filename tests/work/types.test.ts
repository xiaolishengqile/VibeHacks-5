import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkDraft } from "../../src/work/types.js";

const completeDetail = {
	summary: "先形成可以检查的结果",
	steps: ["确认范围", "完成并检查结果"],
	deliverables: ["可交付成果"],
	successCriteria: ["结果完整且可检查"],
	suggestions: ["先完成最小版本"],
	contingencies: [{ risk: "资料不足", trigger: "开始时仍缺资料", action: "先用占位并标记待补" }],
};

test("工作草稿拒绝缺少具体兜底的任务详情", () => {
	const result = validateWorkDraft({
		title: "活动方案",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [{
			title: "写活动方案",
			owner: "self",
			workMinutes: 90,
			waitMinutes: 0,
			dependencyIndexes: [],
			detail: {
				summary: "先形成可审阅的活动方案，再锁定外部资源",
				steps: ["写出目标、流程和预算初稿"],
				deliverables: ["活动方案初稿"],
				successCriteria: ["方案包含目标、流程、预算和备选场地"],
				suggestions: ["先交最小可审版本，不等待所有信息齐全"],
				contingencies: [],
			},
		}],
		assumptions: [],
	});

	assert.equal(result.ok, false);
	assert.match(result.ok ? "" : result.error.join("；"), /兜底/);
});

test("工作草稿拒绝缺少目标时间和负数工时", () => {
	const result = validateWorkDraft({
		title: "季度复盘",
		deadline: "",
		milestones: [],
		nodes: [
			{
				title: "搭框架",
				owner: "self",
				workMinutes: -1,
				waitMinutes: 0,
				dependencyIndexes: [],
			},
		],
		assumptions: [],
	});

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.includes("截止时间无效"), true);
		assert.equal(result.error.includes("节点 1 的工作量不能为负数"), true);
	}
});

test("工作草稿拒绝越界依赖和未确认的协作方", () => {
	const result = validateWorkDraft({
		title: "季度复盘",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [
			{
				title: "拿数据",
				owner: "小王",
				workMinutes: 5,
				waitMinutes: 1440,
				dependencyIndexes: [1],
				potentialCollaborator: { name: "小王", confirmed: false },
			},
		],
		assumptions: [],
	});

	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.error.includes("节点 1 包含越界依赖 1"), true);
		assert.equal(result.error.includes("节点 1 的潜在协作方尚未确认"), true);
	}
});

test("合法工作草稿返回经过规范化的结构", () => {
	const result = validateWorkDraft({
		title: " 季度复盘 ",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [{ title: "老板审核", at: "2026-09-02T18:00:00+08:00", nodeIndexes: [1] }],
		nodes: [
			{
				title: " 找小王拿数据 ",
				owner: "小王",
				workMinutes: 5,
				waitMinutes: 1440,
				dependencyIndexes: [],
				detail: completeDetail,
			},
			{
				title: "搭建复盘框架",
				owner: "self",
				workMinutes: 180,
				waitMinutes: 0,
				dependencyIndexes: [0],
				detail: completeDetail,
			},
		],
		assumptions: ["预计等待一天"],
	});

	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.value.title, "季度复盘");
		assert.equal(result.value.nodes[0]?.title, "找小王拿数据");
	}
});

test("工作草稿保留非空来源标识并拒绝空白来源标识", () => {
	const validDraft = {
		title: "季度复盘",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [{
			title: "搭建复盘框架",
			owner: "self",
			workMinutes: 180,
			waitMinutes: 0,
			dependencyIndexes: [],
			detail: completeDetail,
		}],
		assumptions: [],
	};

	const preserved = validateWorkDraft({
		...validDraft,
		nodes: [{ ...validDraft.nodes[0], sourceNodeId: "node_existing" }],
	});
	assert.equal(preserved.ok && preserved.value.nodes[0]?.sourceNodeId, "node_existing");

	const blank = validateWorkDraft({
		...validDraft,
		nodes: [{ ...validDraft.nodes[0], sourceNodeId: "  " }],
	});
	assert.equal(blank.ok, false);
	if (!blank.ok) assert.equal(blank.error.includes("节点 1 的来源标识不能为空"), true);
});
