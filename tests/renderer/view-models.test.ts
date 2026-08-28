import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutionSummary } from "../../src/desktop/application-service.js";
import type { WorkDecision } from "../../src/work/decision-engine.js";
import { toPetStatus, toTodayActionView } from "../../src/renderer/view-models.js";

const readyDecision: WorkDecision = {
	nodeId: "node_1",
	title: "找小赵拿数据",
	latestStart: "2026-08-28T10:00:00+08:00",
	targetAt: "2026-08-29T18:00:00+08:00",
	recommendedAction: "start",
	risk: "high",
	reason: "需要等待协作方，最晚今天十点开始",
};

const execution = (status: ExecutionSummary["status"], updatedAt = "2026-08-28T09:00:00+08:00"): ExecutionSummary => ({
	id: "run_1",
	title: "整理季度复盘",
	status,
	progress: "正在处理",
	updatedAt,
});

test("等待确认的执行优先映射为桌宠确认状态", () => {
	const view = toPetStatus({ topDecision: readyDecision, activeExecution: execution("awaitingApproval") });
	assert.equal(view, "awaiting_approval");
});

test("桌宠状态按执行优先级稳定映射", () => {
	assert.equal(toPetStatus({ topDecision: null, activeExecution: null }), "idle");
	assert.equal(toPetStatus({ topDecision: readyDecision, activeExecution: null }), "urgent");
	assert.equal(toPetStatus({ topDecision: null, activeExecution: execution("planning") }), "thinking");
	assert.equal(toPetStatus({ topDecision: null, activeExecution: execution("running") }), "executing");
	assert.equal(toPetStatus({ topDecision: null, activeExecution: execution("verifying") }), "executing");
	assert.equal(toPetStatus({ topDecision: null, activeExecution: execution("failed") }), "failed");
	assert.equal(toPetStatus({
		topDecision: null,
		activeExecution: execution("succeeded", "2026-08-28T08:59:55+08:00"),
		now: "2026-08-28T09:00:00+08:00",
	}), "completed");
	assert.equal(toPetStatus({
		topDecision: null,
		activeExecution: execution("succeeded", "2026-08-28T08:59:40+08:00"),
		now: "2026-08-28T09:00:00+08:00",
	}), "idle");
});

test("今日行动包含标题、最晚开始、风险和中文原因", () => {
	const view = toTodayActionView(readyDecision);
	assert.ok(view);
	assert.equal(view.title, "找小赵拿数据");
	assert.equal(view.latestStart, "2026-08-28 10:00");
	assert.equal(view.risk, "高风险");
	assert.equal(view.reason, readyDecision.reason);
});
