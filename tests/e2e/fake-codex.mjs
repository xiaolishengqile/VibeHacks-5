#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import readline from "node:readline";

if (process.argv.includes("--version")) {
	process.stdout.write("codex-cli 0.150.1\n");
	process.exit(0);
}

const input = readline.createInterface({ input: process.stdin });
const mode = process.env.STARTDAY_FAKE_MODE ?? "success";
const authStatePath = process.env.STARTDAY_FAKE_AUTH_PATH ?? "";
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

const assistantDetail = (title, suggestion) => ({
	summary: `完成「${title}」并形成可检查的阶段成果`,
	steps: ["确认范围和所需资料", `完成「${title}」的最小可审版本`],
	deliverables: [`「${title}」阶段成果`],
	successCriteria: ["内容完整、结论清晰且未完成项已标记"],
	suggestions: [suggestion],
	contingencies: [{
		risk: "依赖资料或反馈延期",
		trigger: "约定反馈时间仍未获得关键信息",
		action: "使用现有资料和占位内容先完成最小版本",
	}],
});

const draft = {
	title: "季度复盘",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [{ title: "老板预览", at: "2026-09-02T18:00:00+08:00", nodeIndexes: [1] }],
	nodes: [
		{
			title: "找协作方拿数据", owner: "小王", workMinutes: 20, waitMinutes: 1440, dependencyIndexes: [],
			detail: assistantDetail("找协作方拿数据", "明确反馈截止和二次跟进时间，并准备替代数据源"),
		},
		{
			title: "搭建复盘框架", owner: "self", workMinutes: 70, waitMinutes: 0, dependencyIndexes: [0],
			detail: assistantDetail("搭建复盘框架", "先写完整叙事文稿，再制作演示页面；缺失数据先占位"),
		},
	],
	assumptions: ["测试用确定性工作草稿"],
	confidence: 0.96,
	blockingQuestion: null,
};

const interpretation = (threadId, turnId, params) => {
	const prompt = params.input?.[0]?.text ?? "";
	const sourceNodeIds = [...String(prompt).matchAll(/"sourceNodeId":"([^"]+)"/g)].map((match) => match[1]);
	const result = structuredClone(draft);
	result.nodes = result.nodes.map((node, index) => sourceNodeIds[index]
		? { ...node, sourceNodeId: sourceNodeIds[index] }
		: node);
	if (String(prompt).includes("临时出一版下午发送的全员用户群文案")) {
		result.nodes.push({
			title: "完成全员用户群文案",
			owner: "self",
			workMinutes: 80,
			waitMinutes: 0,
			dependencyIndexes: [],
			detail: assistantDetail("完成全员用户群文案", "复用历史文案，预留上级审核和修改时间"),
		});
		result.milestones.push({
			title: "全员用户群文案发布",
			at: "2026-08-31T15:00:00+08:00",
			nodeIndexes: [2],
		});
	}
	send({
		method: "item/completed",
		params: { threadId, turnId, item: { type: "agentMessage", text: JSON.stringify(result) } },
	});
	completeTurn(threadId, turnId);
};

const plan = (threadId, turnId) => {
	send({ method: "item/plan/delta", params: { threadId, turnId, itemId: `plan-${turnId}`, delta: "生成复盘成果" } });
	completeTurn(threadId, turnId);
};

const execute = (threadId, turnId, params) => {
	if (mode === "slow") {
		const cwd = typeof params.cwd === "string" ? params.cwd : process.cwd();
		const path = join(cwd, "运行中草稿.md");
		const requestId = `approval-${++approvalSequence}`;
		pending.set(requestId, { threadId, turnId, path, name: "运行中草稿.md" });
		void mkdir(cwd, { recursive: true }).then(async () => {
			await writeFile(path, "# 运行中草稿\n", "utf8");
			send({
				method: "item/completed",
				params: { threadId, turnId, item: { type: "fileChange", changes: [{ path, kind: { type: "add" } }] } },
			});
			send({
				id: requestId,
				method: "item/fileChange/requestApproval",
				params: { threadId, turnId, changes: [{ path, kind: { type: "update" } }] },
			});
		});
		return;
	}
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
		result: {
			account: authStatePath && existsSync(authStatePath) ? { type: "chatgpt", email: "test@example.com" } : null,
			requiresOpenaiAuth: true,
		},
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
		if (message.params.outputSchema) {
			const prompt = message.params.input?.[0]?.text ?? "";
			if (String(prompt).includes("排期失败测试")) {
				return later(() => send({
					method: "turn/completed",
					params: { threadId, turn: { id: turnId, status: "failed", error: { message: "模拟工作理解失败" } } },
				}));
			}
			later(
				() => interpretation(threadId, turnId, message.params),
				String(prompt).includes("慢速排期测试") ? 600 : 30,
			);
		}
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
