import type { ApplicationSnapshot, UiCommand } from "../desktop/application-service.js";
import { toWeekCalendarView, weekOffsetDeltaFromSwipe } from "./calendar-view.js";
import { requestText } from "./dialogs.js";
import { clearElement, createTextElement, renderEmpty, requiredElement, setText } from "./dom.js";
import { formatHumanInstant, toExecutionView, toGraphView, toTodayActionView } from "./view-models.js";

const text = (id: string, value: string): void => setText(requiredElement(id), value);
let snapshot: ApplicationSnapshot | null = null;
let requestSequence = 0;
let calendarWeekOffset = 0;
let touchStartX: number | null = null;
let lastWheelShiftAt = 0;

const actionButton = (label: string, action: () => Promise<void>, danger = false): HTMLButtonElement => {
	const button = createTextElement("button", danger ? "danger-button" : "text-button", label) as HTMLButtonElement;
	button.type = "button";
	button.addEventListener("click", () => {
		button.disabled = true;
		void action().finally(() => { button.disabled = false; });
	});
	return button;
};

const run = async (command: UiCommand): Promise<void> => {
	const request = ++requestSequence;
	const result = await window.startDay.runCommand(command);
	if (request !== requestSequence) return;
	if (result.ok) render(result.value);
	else text("today-reason", result.error);
};

const renderCards = (
	targetId: string,
	items: readonly { readonly title: string; readonly detail: string }[],
	emptyMessage: string,
): void => {
	const target = requiredElement<HTMLDivElement>(targetId);
	clearElement(target);
	if (items.length === 0) {
		target.classList.add("empty-state");
		renderEmpty(target, emptyMessage);
		return;
	}
	target.classList.remove("empty-state");
	for (const item of items) {
		const card = document.createElement("article");
		card.className = "list-card";
		card.append(createTextElement("strong", "", item.title));
		card.append(createTextElement("p", "", item.detail));
		target.append(card);
	}
};

const renderCodex = (value: ApplicationSnapshot): void => {
	text("readiness-summary", [
		value.codex.reason,
		value.codex.ready && value.codex.model ? `模型：${value.codex.model}` : null,
		value.codex.account,
		value.codex.rateLimit,
		"成果自动保存",
	].filter((item): item is string => Boolean(item)).join(" · "));
	const login = requiredElement<HTMLButtonElement>("codex-login");
	login.hidden = !value.codex.canStartBrowserLogin;
};

const renderCalendar = (value: ApplicationSnapshot): void => {
	const calendar = toWeekCalendarView(value, new Date().toISOString(), calendarWeekOffset);
	text("calendar-range", calendar.rangeLabel);
	const outside = requiredElement<HTMLParagraphElement>("calendar-outside");
	setText(outside, calendar.outsideWeekCount > 0 ? `另有 ${calendar.outsideWeekCount} 项安排在其他周` : "");
	outside.hidden = calendar.outsideWeekCount === 0;
	const target = requiredElement<HTMLDivElement>("week-calendar");
	clearElement(target);
	for (const day of calendar.days) {
		const column = document.createElement("article");
		column.className = `calendar-day${day.isToday ? " is-today" : ""}${day.key === calendar.focusDayKey ? " is-focus" : ""}`;
		const heading = document.createElement("header");
		heading.append(createTextElement("strong", "", day.weekday));
		heading.append(createTextElement("span", "", day.dateLabel));
		column.append(heading);
		for (const item of day.items) {
			const event = document.createElement("div");
			event.className = `calendar-event calendar-event--${item.tone}`;
			const time = createTextElement("time", "", item.timeLabel);
			time.setAttribute("datetime", item.dateTime);
			event.append(time);
			event.append(createTextElement("strong", "", item.title));
			event.append(createTextElement("span", "", `${item.owner} · ${item.status}`));
			column.append(event);
		}
		target.append(column);
	}
};

const renderExecutionState = (value: ApplicationSnapshot): void => {
	const target = requiredElement<HTMLDivElement>("execution-state-list");
	clearElement(target);
	target.classList.remove("empty-state");
	let count = 0;
	for (const execution of [...value.executions].reverse()) {
		const view = toExecutionView(execution);
		const card = document.createElement("article");
		card.className = "list-card";
		card.append(createTextElement("strong", "", `${view.title} · ${view.status}`));
		card.append(createTextElement("p", "", `${view.progress} · ${view.updatedAt}`));
		card.append(createTextElement(
			"p",
			"",
			`模型：${execution.model} · 网络：${execution.networkEnabled ? "允许" : "关闭"} · 成果自动保存`,
		));
		const actions = document.createElement("div");
		actions.className = "button-row";
		const hasPendingApproval = value.approvals.some((approval) => approval.executionId === execution.id);
		if (execution.status === "awaitingApproval" && !hasPendingApproval) {
			actions.append(actionButton("确认并开始", () => run({ name: "confirmExecutionPlan", executionId: execution.id })));
		}
		if (["planning", "running", "verifying", "awaitingApproval"].includes(execution.status)) {
			actions.append(actionButton("取消执行", () => run({ name: "cancelExecution", executionId: execution.id }), true));
		}
		if (execution.status === "paused") {
			actions.append(actionButton("恢复执行", () => run({ name: "resumeExecution", executionId: execution.id })));
		}
		if (actions.childElementCount > 0) card.append(actions);
		target.append(card);
		count += 1;
	}
	for (const approval of value.approvals) {
		const card = document.createElement("article");
		card.className = "list-card";
		card.append(createTextElement("strong", "", `${approval.risk === "high" ? "高风险" : approval.risk === "medium" ? "中风险" : "低风险"}确认`));
		card.append(createTextElement("p", "", approval.summary));
		const actions = document.createElement("div");
		actions.className = "button-row";
		actions.append(actionButton("批准一次", () => run({
			name: "answerExecutionApproval",
			executionId: approval.executionId,
			requestId: approval.requestId,
			decision: "approve",
		})));
		actions.append(actionButton("拒绝", () => run({
			name: "answerExecutionApproval",
			executionId: approval.executionId,
			requestId: approval.requestId,
			decision: "deny",
		}), true));
		card.append(actions);
		target.append(card);
		count += 1;
	}
	for (const artifact of value.artifacts) {
		const card = document.createElement("article");
		card.className = "list-card";
		card.append(createTextElement("strong", "", `${artifact.name}${artifact.verified ? " · 已验证" : " · 待验证"}`));
		card.append(createTextElement("p", "", artifact.path));
		const actions = document.createElement("div");
		actions.className = "button-row";
		if (artifact.verified) {
			actions.append(actionButton("在文件夹中查看", () => run({
				name: "openExecutionArtifact", executionId: artifact.executionId, artifactId: artifact.id,
			})));
			const execution = value.executions.find((entry) => entry.id === artifact.executionId);
			if (execution?.status === "succeeded") actions.append(actionButton("接受成果", async () => {
				const value = await requestText({
					title: "记录实际耗时", message: "请输入这项工作的实际耗时（分钟）", defaultValue: "60", inputType: "number",
				});
				const actualMinutes = Number(value);
				if (!Number.isInteger(actualMinutes) || actualMinutes <= 0) return;
				await run({
					name: "acceptExecutionArtifact",
					executionId: artifact.executionId,
					artifactId: artifact.id,
					actualMinutes,
				});
			}));
		}
		if (actions.childElementCount > 0) card.append(actions);
		target.append(card);
		count += 1;
	}
	if (count === 0) {
		target.classList.add("empty-state");
		renderEmpty(target, "当前没有执行任务或待确认操作");
	}
};

const render = (value: ApplicationSnapshot): void => {
	snapshot = value;
	renderCodex(value);
	renderCalendar(value);
	text("goal-title", value.goal?.title ?? "把想法变成今天能推进的工作");
	text("goal-deadline", value.goal ? `目标截止：${formatHumanInstant(value.goal.deadline)}` : "输入工作想法后，这里会展示完整计划。");
	const today = toTodayActionView(value.decisions[0] ?? null);
	text("today-title", today?.title ?? "暂无当前行动");
	text("today-risk", today?.risk ?? "等待输入");
	text("today-time", today ? `最晚 ${today.latestStart}` : "");
	text("today-reason", today?.reason ?? "从桌宠打开轻面板，输入你想完成的工作。");
	const graph = toGraphView(value);
	text("graph-count", `${graph.length} 个节点`);
	renderCards("graph-list", graph.map((node) => ({
		title: `${node.title} · ${node.status}`,
		detail: [
			`负责人：${node.owner}`,
			node.dependencies.length > 0 ? `依赖：${node.dependencies.join("、")}` : "无依赖",
			node.waitLabel ? `等待：${node.waitLabel}` : null,
			node.latestStart ? `最晚 ${node.latestStart}` : null,
		].filter((item): item is string => Boolean(item)).join(" · "),
	})), "暂无工作节点");
	renderExecutionState(value);
	renderCards("history-list", [
		...value.changes.map((item) => ({ title: item.reason, detail: formatHumanInstant(item.createdAt) })),
		...value.events.map((item) => ({ title: item.message, detail: formatHumanInstant(item.at) })),
	].slice(-20).reverse(), "当前没有历史记录");
	const start = requiredElement<HTMLButtonElement>("start-today-execution");
	const nodeId = value.nodes.find((node) => node.status === "ready")?.id;
	const active = value.executions.some((entry) => !["succeeded", "failed", "canceled"].includes(entry.status));
	start.disabled = !value.goal || !value.profile?.confirmed || !nodeId || !value.codex.ready || active;
};

const reload = async (): Promise<void> => {
	const request = ++requestSequence;
	const result = await window.startDay.getSnapshot();
	if (request !== requestSequence) return;
	if (result.ok) render(result.value);
	else text("today-reason", result.error);
};

const shiftCalendarWeek = (delta: number): void => {
	calendarWeekOffset += delta;
	if (snapshot) renderCalendar(snapshot);
};

const calendarTarget = requiredElement<HTMLDivElement>("week-calendar");
requiredElement<HTMLButtonElement>("calendar-prev-week").addEventListener("click", () => shiftCalendarWeek(-1));
requiredElement<HTMLButtonElement>("calendar-next-week").addEventListener("click", () => shiftCalendarWeek(1));
calendarTarget.addEventListener("touchstart", (event) => {
	touchStartX = event.changedTouches[0]?.clientX ?? null;
}, { passive: true });
calendarTarget.addEventListener("touchend", (event) => {
	if (touchStartX === null) return;
	const delta = weekOffsetDeltaFromSwipe(touchStartX, event.changedTouches[0]?.clientX ?? touchStartX);
	touchStartX = null;
	if (delta !== 0) shiftCalendarWeek(delta);
}, { passive: true });
calendarTarget.addEventListener("wheel", (event) => {
	if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
	const delta = weekOffsetDeltaFromSwipe(0, -event.deltaX, 36);
	if (delta === 0 || event.timeStamp - lastWheelShiftAt < 350) return;
	event.preventDefault();
	lastWheelShiftAt = event.timeStamp;
	shiftCalendarWeek(delta);
}, { passive: false });

requiredElement<HTMLButtonElement>("codex-login").addEventListener("click", () => void run({ name: "startCodexLogin" }));
requiredElement<HTMLButtonElement>("codex-refresh").addEventListener("click", () => void run({ name: "refreshCodex" }));
requiredElement<HTMLButtonElement>("start-today-execution").addEventListener("click", () => {
	const goalId = snapshot?.goal?.id;
	const nodeId = snapshot?.nodes.find((node) => node.status === "ready")?.id;
	const allowWebResearch = requiredElement<HTMLInputElement>("allow-web-research").checked;
	if (goalId && nodeId) void run({ name: "startExecution", goalId, nodeId, allowWebResearch });
});
window.startDay.subscribe(() => void reload());
await reload();
