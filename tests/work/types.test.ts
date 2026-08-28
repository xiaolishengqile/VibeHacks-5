import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkDraft } from "../../src/work/types.js";

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
			},
			{
				title: "搭建复盘框架",
				owner: "self",
				workMinutes: 180,
				waitMinutes: 0,
				dependencyIndexes: [0],
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
