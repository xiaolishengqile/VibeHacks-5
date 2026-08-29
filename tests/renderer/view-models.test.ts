import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutionSummary } from "../../src/desktop/application-service.js";
import type { WorkDecision } from "../../src/work/decision-engine.js";
import { toMiniExecutionControl, toPetStatus, toTodayActionView } from "../../src/renderer/view-models.js";

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
	model: "gpt-5.6-terra",
	workspaceRoots: ["/tmp/work"],
	networkEnabled: false,
	allowedTools: ["创建文件"],
	risk: "medium",
	error: null,
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
	assert.equal(view.latestStart, "8月28日 10:00");
	assert.equal(view.risk, "高风险");
	assert.equal(view.reason, readyDecision.reason);
});

test("今日行动把排期明细压缩成可读提醒", () => {
	const view = toTodayActionView({
		...readyDecision,
		latestStart: "2026-08-28T15:54:00+08:00",
		reason: "目标为同事数据到齐 2026-09-01T09:30:00+08:00；预计工作 30 分钟；外部等待 1440 分钟；安全缓冲 6 分钟；最晚开始 2026-08-28T15:54:00+08:00",
	});

	assert.equal(view?.reason, "需要等待 1 天；预计工作 30 分钟；最晚 8月28日 15:54 开始。");
});

test("轻面板按执行阶段给出唯一的主要动作", () => {
	assert.deepEqual(toMiniExecutionControl({ execution: null, hasApproval: false, hasVerifiedArtifact: false, canStart: true }), {
		primaryLabel: "生成执行计划",
		primaryAction: "start",
		secondaryAction: null,
	});
	assert.equal(toMiniExecutionControl({
		execution: execution("awaitingApproval"), hasApproval: false, hasVerifiedArtifact: false, canStart: false,
	}).primaryAction, "confirm");
	assert.deepEqual(toMiniExecutionControl({
		execution: execution("awaitingApproval"), hasApproval: true, hasVerifiedArtifact: false, canStart: false,
	}), {
		primaryLabel: "批准一次",
		primaryAction: "approve",
		secondaryAction: "deny",
	});
	assert.equal(toMiniExecutionControl({
		execution: execution("running"), hasApproval: false, hasVerifiedArtifact: false, canStart: false,
	}).primaryAction, "cancel");
	assert.equal(toMiniExecutionControl({
		execution: execution("paused"), hasApproval: false, hasVerifiedArtifact: false, canStart: false,
	}).primaryAction, "resume");
	assert.equal(toMiniExecutionControl({
		execution: execution("succeeded"), hasApproval: false, hasVerifiedArtifact: true, canStart: false,
	}).primaryAction, "accept");
	assert.equal(toMiniExecutionControl({
		execution: execution("succeeded"), hasApproval: false, hasVerifiedArtifact: true, canStart: true,
	}).primaryAction, "start");
});
