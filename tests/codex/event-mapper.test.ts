import assert from "node:assert/strict";
import test from "node:test";

import { mapCodexEvent } from "../../src/codex/event-mapper.js";

test("计划增量和代理消息映射为用户可读进度", () => {
	assert.deepEqual(mapCodexEvent({
		method: "item/plan/delta",
		params: { threadId: "t1", turnId: "u1", itemId: "p1", delta: "先读取资料" },
	}), { type: "plan", message: "先读取资料" });
	assert.deepEqual(mapCodexEvent({
		method: "item/completed",
		params: { threadId: "t1", turnId: "u1", item: { type: "agentMessage", text: "框架已经完成" } },
	}), { type: "progress", message: "框架已经完成" });
});

test("命令结果、文件变更和网页调研映射为明确事件", () => {
	const command = mapCodexEvent({
		method: "item/completed",
		params: {
			threadId: "t1",
			turnId: "u1",
			item: {
				type: "commandExecution",
				command: "npm test",
				status: "completed",
				aggregatedOutput: "全部通过",
				exitCode: 0,
			},
		},
	});
	assert.deepEqual(command, { type: "tool", message: "命令完成：npm test\n全部通过" });

	const files = mapCodexEvent({
		method: "item/completed",
		params: {
			threadId: "t1",
			turnId: "u1",
			item: {
				type: "fileChange",
				status: "completed",
				changes: [
					{ path: "/tmp/work/report.md", kind: { type: "add" }, diff: "+标题" },
					{ path: "/tmp/work/notes.md", kind: { type: "update", move_path: null }, diff: "+结论" },
				],
			},
		},
	});
	assert.deepEqual(files, {
		type: "artifact",
		message: "文件变更：report.md、notes.md",
		paths: ["/tmp/work/report.md", "/tmp/work/notes.md"],
	});

	assert.deepEqual(mapCodexEvent({
		method: "item/completed",
		params: { threadId: "t1", turnId: "u1", item: { type: "webSearch", query: "季度复盘模板" } },
	}), { type: "tool", message: "网页调研：季度复盘模板" });
});

test("最终回合通知权威区分成功、失败和中断", () => {
	assert.deepEqual(mapCodexEvent({
		method: "turn/completed",
		params: { threadId: "t1", turn: { id: "u1", status: "completed", error: null } },
	}), { type: "turnCompleted", message: "执行代理已完成本回合" });
	assert.deepEqual(mapCodexEvent({
		method: "turn/completed",
		params: { threadId: "t1", turn: { id: "u1", status: "failed", error: { message: "模型不可用" } } },
	}), { type: "turnFailed", message: "模型不可用" });
	assert.deepEqual(mapCodexEvent({
		method: "turn/completed",
		params: { threadId: "t1", turn: { id: "u1", status: "interrupted", error: null } },
	}), { type: "turnInterrupted", message: "执行已被中断" });
});

test("命令输出隐藏密钥并限制长度", () => {
	const mapped = mapCodexEvent({
		method: "item/completed",
		params: {
			threadId: "t1",
			turnId: "u1",
			item: {
				type: "commandExecution",
				command: "node task.js",
				status: "failed",
				aggregatedOutput: `OPENAI_API_KEY=sk-test-secret-value\n${"x".repeat(5_000)}`,
				exitCode: 1,
			},
		},
	});
	assert.equal(mapped?.type, "tool");
	assert.doesNotMatch(mapped?.message ?? "", /sk-test-secret-value/);
	assert.ok((mapped?.message.length ?? 0) < 2_200);
});
