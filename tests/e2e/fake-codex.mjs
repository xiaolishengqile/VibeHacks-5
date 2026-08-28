#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import readline from "node:readline";

if (process.argv.includes("--version")) {
	process.stdout.write("codex-cli 0.150.1\n");
	process.exit(0);
}

const input = readline.createInterface({ input: process.stdin });
const mode = process.env.STARTDAY_FAKE_MODE ?? "success";
const pending = new Map();
let threadSequence = 0;
let turnSequence = 0;
let approvalSequence = 0;

const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const later = (callback, delay = 30) => setTimeout(() => void callback(), delay);
const completeTurn = (threadId, turnId) => send({
	method: "turn/completed",
	params: { threadId, turn: { id: turnId, status: "completed", error: null } },
});

const draft = {
	title: "季度复盘",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [{ title: "老板预览", at: "2026-09-02T18:00:00+08:00", nodeIndexes: [1] }],
	nodes: [
		{ title: "找协作方拿数据", owner: "小王", workMinutes: 20, waitMinutes: 1440, dependencyIndexes: [] },
		{ title: "搭建复盘框架", owner: "self", workMinutes: 70, waitMinutes: 0, dependencyIndexes: [0] },
	],
	assumptions: ["测试用确定性工作草稿"],
	confidence: 0.96,
	blockingQuestion: null,
};

const interpretation = (threadId, turnId) => {
	send({
		method: "item/completed",
		params: { threadId, turnId, item: { type: "agentMessage", text: JSON.stringify(draft) } },
	});
	completeTurn(threadId, turnId);
};

const plan = (threadId, turnId) => {
	send({ method: "item/plan/delta", params: { threadId, turnId, itemId: `plan-${turnId}`, delta: "读取授权目录并生成成果" } });
	completeTurn(threadId, turnId);
};

const execute = (threadId, turnId, params) => {
	if (mode === "slow") return;
	if (mode === "failure") {
		return later(() => send({
			method: "turn/completed",
			params: { threadId, turn: { id: turnId, status: "failed", error: { message: "模拟执行失败" } } },
		}));
	}
	const cwd = typeof params.cwd === "string" ? params.cwd : process.cwd();
	const goal = params.input?.[0]?.text ?? "";
	const name = String(goal).includes("搭建复盘框架") ? "复盘初稿.md" : "协作数据.md";
	const path = join(cwd, name);
	const requestId = `approval-${++approvalSequence}`;
	pending.set(requestId, { threadId, turnId, path, name });
	later(() => send({
		id: requestId,
		method: "item/fileChange/requestApproval",
		params: { threadId, turnId, changes: [{ path, kind: { type: "add" } }] },
	}));
};

input.on("line", (line) => {
	const message = JSON.parse(line);
	if (typeof message.id === "string" && Object.hasOwn(message, "result")) {
		const work = pending.get(message.id);
		pending.delete(message.id);
		if (!work) return;
		if (message.result?.decision !== "accept") return completeTurn(work.threadId, work.turnId);
		void (async () => {
			await mkdir(dirname(work.path), { recursive: true }).catch(() => undefined);
			await writeFile(work.path, `# ${work.name}\n\n启动日端到端验收成果\n`, "utf8");
			send({
				method: "item/completed",
				params: {
					threadId: work.threadId,
					turnId: work.turnId,
					item: { type: "fileChange", changes: [{ path: work.path, kind: { type: "add" } }] },
				},
			});
			completeTurn(work.threadId, work.turnId);
		})();
		return;
	}
	if (message.method === "initialize") return send({ id: message.id, result: {} });
	if (message.method === "initialized") return;
	if (message.method === "account/read") return send({
		id: message.id,
		result: { account: { type: "chatgpt", email: "test@example.com" }, requiresOpenaiAuth: true },
	});
	if (message.method === "model/list") return send({
		id: message.id,
		result: { data: [{ id: "gpt-5.6-terra", model: "gpt-5.6-terra", displayName: "测试模型", isDefault: true }], nextCursor: null },
	});
	if (message.method === "account/rateLimits/read") return send({
		id: message.id,
		result: { rateLimits: { primary: { usedPercent: 1 }, rateLimitReachedType: null } },
	});
	if (message.method === "thread/start") return send({
		id: message.id,
		result: { thread: { id: `thread-${++threadSequence}` } },
	});
	if (message.method === "turn/start") {
		const threadId = message.params.threadId;
		const turnId = `turn-${++turnSequence}`;
		send({ id: message.id, result: { turn: { id: turnId } } });
		if (message.params.outputSchema) later(() => interpretation(threadId, turnId));
		else if (message.params.sandboxPolicy?.type === "readOnly") later(() => plan(threadId, turnId));
		else execute(threadId, turnId, message.params);
		return;
	}
	if (message.method === "turn/interrupt") {
		send({ id: message.id, result: {} });
		later(() => send({
			method: "turn/completed",
			params: { threadId: message.params.threadId, turn: { id: message.params.turnId, status: "interrupted", error: null } },
		}));
	}
});
