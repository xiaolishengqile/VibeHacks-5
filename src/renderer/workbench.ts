import type { ApplicationSnapshot, UiCommand } from "../desktop/application-service.js";
import type { CalendarDayView, WeekCalendarView } from "./calendar-view.js";
import { toCalendarWindowView } from "./calendar-view.js";
import { localWorkdayDateTimeValue } from "./date-input.js";
import { confirmAction, requestText } from "./dialogs.js";
import { clearElement, createTextElement, renderEmpty, requiredElement, setText } from "./dom.js";
import { toTaskDetailView, type TaskDetailView } from "./task-detail-view.js";
import { formatHumanInstant, toExecutionView, toGraphView, toTodayActionView } from "./view-models.js";

const text = (id: string, value: string): void => setText(requiredElement(id), value);
let snapshot: ApplicationSnapshot | null = null;
let requestSequence = 0;
let calendarDayOffset = 0;
let calendarSlideToken = 0;
let calendarSliding = false;
let calendarDrag: {
	readonly pointerId: number;
	readonly startX: number;
	readonly track: HTMLDivElement;
	readonly target: HTMLDivElement;
	lastPercent: number;
} | null = null;
let lastWheelShiftAt = 0;
const calendarSlideMs = 240;
const calendarWindowDays = 7;
const calendarStartPercent = -100;

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

const durationLabel = (minutes: number): string => {
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	if (hours > 0 && remainder > 0) return `${hours} 小时 ${remainder} 分钟`;
	if (hours > 0) return `${hours} 小时`;
	return `${minutes} 分钟`;
};

const detailList = (title: string, items: readonly string[]): HTMLElement => {
	const section = document.createElement("section");
	section.className = "task-detail-section";
	section.append(createTextElement("h3", "", title));
	const list = document.createElement("ul");
	for (const item of items) list.append(createTextElement("li", "", item));
	section.append(list);
	return section;
};

const showTaskDetail = (detail: TaskDetailView): void => {
	document.querySelector("dialog.task-detail-dialog")?.remove();
	const dialog = document.createElement("dialog");
	dialog.className = "app-dialog task-detail-dialog";
	const card = document.createElement("article");
	card.className = "task-detail-card";
	const header = document.createElement("header");
	const heading = createTextElement("h2", "", detail.title);
	heading.id = "task-detail-title";
	dialog.setAttribute("aria-labelledby", heading.id);
	header.append(heading);
	header.append(createTextElement("span", "pill", detail.risk));
	card.append(header);
	card.append(createTextElement(
		"p",
		"task-detail-meta",
		`${detail.scheduledLabel} · ${detail.owner} · ${detail.status}`,
	));
	card.append(createTextElement(
		"p",
		"task-detail-meta",
		`预计工作 ${durationLabel(detail.workMinutes)} · 最晚开始 ${detail.latestStartLabel}`,
	));
	if (detail.waitMinutes > 0) {
		card.append(createTextElement("p", "task-detail-meta", `外部等待 ${durationLabel(detail.waitMinutes)}`));
	}
	if (detail.dependencies.length > 0) {
		card.append(createTextElement("p", "task-detail-meta", `前置任务：${detail.dependencies.join("、")}`));
	}
	const purpose = document.createElement("section");
	purpose.className = "task-detail-section";
	purpose.append(createTextElement("h3", "", "任务目的"));
	purpose.append(createTextElement("p", "", detail.summary));
	card.append(purpose);
	card.append(detailList("执行步骤", detail.steps));
	const delivery = document.createElement("section");
	delivery.className = "task-detail-section task-detail-delivery";
	delivery.append(createTextElement("h3", "", "交付物与完成标准"));
	delivery.append(detailList("交付物", detail.deliverables), detailList("完成标准", detail.successCriteria));
	card.append(delivery);
	card.append(detailList("助理建议", detail.suggestions));
	const risks = document.createElement("section");
	risks.className = "task-detail-section";
	risks.append(createTextElement("h3", "", "风险与兜底"));
	for (const contingency of detail.contingencies) {
		const risk = document.createElement("article");
		risk.className = "task-contingency";
		risk.append(createTextElement("strong", "", contingency.risk));
		risk.append(createTextElement("p", "", `触发条件：${contingency.trigger}`));
		risk.append(createTextElement("p", "", `兜底动作：${contingency.action}`));
		risks.append(risk);
	}
	if (detail.reason) risks.append(createTextElement("p", "task-detail-reason", `排期判断：${detail.reason}`));
	card.append(risks);
	const close = createTextElement("button", "primary-button task-detail-close", "关闭详情") as HTMLButtonElement;
	close.type = "button";
	close.addEventListener("click", () => dialog.close());
	card.append(close);
	dialog.append(card);
	dialog.addEventListener("close", () => dialog.remove(), { once: true });
	document.body.append(dialog);
	dialog.showModal();
	close.focus();
};

const renderCalendarDay = (day: CalendarDayView): HTMLElement => {
	const column = document.createElement("article");
	column.className = `calendar-day${day.isToday ? " is-today" : ""}`;
	const heading = document.createElement("header");
	heading.append(createTextElement("strong", "", day.weekday));
	heading.append(createTextElement("span", "", day.dateLabel));
	column.append(heading);
	for (const item of day.items) {
		const event = document.createElement("button");
		event.type = "button";
		event.className = `calendar-event calendar-event--${item.tone}`;
		event.setAttribute("aria-haspopup", "dialog");
		const time = createTextElement("time", "", item.timeLabel);
		time.setAttribute("datetime", item.dateTime);
		event.append(time);
		event.append(createTextElement("strong", "", item.title));
		event.append(createTextElement("span", "", `${item.owner} · ${item.status}`));
		event.addEventListener("click", () => {
			if (!snapshot) return;
			const detail = toTaskDetailView(snapshot, item.id);
			if (detail) showTaskDetail(detail);
		});
		column.append(event);
	}
	const capacity = document.createElement("footer");
	capacity.className = "calendar-capacity";
	capacity.append(createTextElement(
		"span",
		"",
		day.reservedMinutes > 0
			? `已安排 ${durationLabel(day.scheduledMinutes)} · 已为临时事项保留 ${durationLabel(day.reservedMinutes)}`
			: day.scheduledMinutes > 0 ? `已安排 ${durationLabel(day.scheduledMinutes)}` : "周末不安排工作",
	));
	column.append(capacity);
	return column;
};

const renderCalendarWeek = (calendar: WeekCalendarView): HTMLElement => {
	const week = document.createElement("div");
	week.className = "calendar-week";
	for (const day of calendar.days) {
		const column = renderCalendarDay(day);
		column.classList.toggle("is-focus", day.key === calendar.focusDayKey);
		week.append(column);
	}
	return week;
};

const renderCalendarTrack = (calendars: readonly WeekCalendarView[]): HTMLDivElement => {
	const track = document.createElement("div");
	track.className = "calendar-slider-track";
	track.dataset.calendarTrack = "";
	for (const calendar of calendars) track.append(renderCalendarWeek(calendar));
	return track;
};

const updateCalendarHeading = (calendar: WeekCalendarView): void => {
	text("calendar-range", calendar.rangeLabel);
	const outside = requiredElement<HTMLParagraphElement>("calendar-outside");
	setText(outside, calendar.outsideWeekCount > 0 ? `另有 ${calendar.outsideWeekCount} 项安排在当前视图之外` : "");
	outside.hidden = calendar.outsideWeekCount === 0;
};

const renderCalendar = (value: ApplicationSnapshot): void => {
	const calendar = toCalendarWindowView(value, new Date().toISOString(), calendarDayOffset);
	updateCalendarHeading(calendar);
	const target = requiredElement<HTMLDivElement>("week-calendar");
	target.setAttribute("aria-busy", "false");
	clearElement(target);
	target.append(renderCalendarTrack([calendar]));
};

const renderExecutionState = (value: ApplicationSnapshot): void => {
	const panel = requiredElement<HTMLDetailsElement>("execution-panel");
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
	} else {
		panel.open = true;
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

const calendarTransform = (percent: number): string => `translate3d(${percent}%, 0, 0)`;
const clampCalendarPercent = (percent: number): number => Math.max(-200, Math.min(0, percent));
const clampDayDelta = (delta: number): number => Math.max(-calendarWindowDays, Math.min(calendarWindowDays, delta));
const calendarPercentForDayDelta = (dayDelta: number): number =>
	calendarStartPercent - (clampDayDelta(dayDelta) / calendarWindowDays) * 100;

const dayDeltaFromDrag = (startX: number, endX: number, width: number): number => {
	const rawDelta = (startX - endX) / Math.max(1, width / calendarWindowDays);
	if (Math.abs(rawDelta) < 0.35) return 0;
	return clampDayDelta(Math.round(rawDelta));
};

const renderSlidingCalendarTrack = (): { readonly target: HTMLDivElement; readonly track: HTMLDivElement } | null => {
	if (!snapshot) return null;
	const target = requiredElement<HTMLDivElement>("week-calendar");
	const now = new Date().toISOString();
	const previous = toCalendarWindowView(snapshot, now, calendarDayOffset - calendarWindowDays);
	const current = toCalendarWindowView(snapshot, now, calendarDayOffset);
	const next = toCalendarWindowView(snapshot, now, calendarDayOffset + calendarWindowDays);
	target.setAttribute("aria-busy", "true");
	clearElement(target);
	const track = renderCalendarTrack([previous, current, next]);
	track.style.transform = calendarTransform(calendarStartPercent);
	target.append(track);
	return { target, track };
};

const completeCalendarMotion = (dayDelta: number): void => {
	calendarDayOffset += dayDelta;
	calendarSliding = false;
	requiredElement<HTMLDivElement>("week-calendar").classList.remove("is-dragging");
	if (snapshot) renderCalendar(snapshot);
};

const animateCalendarTrack = (
	track: HTMLDivElement,
	fromPercent: number,
	toPercent: number,
	dayDelta: number,
	token: number,
): void => {
	const finish = (): void => {
		if (token !== calendarSlideToken) return;
		completeCalendarMotion(dayDelta);
	};
	track.style.transform = calendarTransform(fromPercent);
	const animation = track.animate([
		{ transform: calendarTransform(fromPercent) },
		{ transform: calendarTransform(toPercent) },
	], {
		duration: calendarSlideMs,
		easing: "cubic-bezier(0.25, 0.86, 0.2, 1)",
		fill: "forwards",
	});
	let finished = false;
	const finishOnce = (): void => {
		if (finished) return;
		finished = true;
		finish();
	};
	animation.addEventListener("finish", finishOnce, { once: true });
	window.setTimeout(finishOnce, calendarSlideMs + 180);
};

const shiftCalendarDays = (delta: number): void => {
	const dayDelta = clampDayDelta(Math.round(delta));
	if (!snapshot || dayDelta === 0 || calendarSliding) return;
	calendarSliding = true;
	const token = ++calendarSlideToken;
	const rail = renderSlidingCalendarTrack();
	if (!rail) return completeCalendarMotion(0);
	animateCalendarTrack(
		rail.track,
		calendarStartPercent,
		calendarPercentForDayDelta(dayDelta),
		dayDelta,
		token,
	);
};

const calendarTarget = requiredElement<HTMLDivElement>("week-calendar");
requiredElement<HTMLButtonElement>("calendar-prev-week").addEventListener("click", () => shiftCalendarDays(-calendarWindowDays));
requiredElement<HTMLButtonElement>("calendar-next-week").addEventListener("click", () => shiftCalendarDays(calendarWindowDays));
const addManualTodo = requiredElement<HTMLButtonElement>("add-manual-todo");
addManualTodo.addEventListener("click", async () => {
	const title = await requestText({ title: "添加待办", message: "要添加什么待办？", confirmLabel: "下一步" });
	if (!title) return;
	const at = await requestText({
		title: "安排时间",
		message: "选择工作日时间，周六周日不安排工作",
		defaultValue: localWorkdayDateTimeValue(),
		inputType: "datetime-local",
		confirmLabel: "加入日历",
	});
	if (!at) return;
	const instant = new Date(at);
	if (Number.isNaN(instant.getTime())) return text("today-reason", "待办时间无效");
	addManualTodo.disabled = true;
	try {
		const result = await window.startDay.addManualTodo({ title, at: instant.toISOString() });
		if (result.ok) {
			render(result.value);
			text("today-reason", `已把「${title}」加入工作日历`);
		} else {
			text("today-reason", result.error);
		}
	} finally {
		addManualTodo.disabled = false;
	}
});
calendarTarget.addEventListener("pointerdown", (event) => {
	if (!snapshot || calendarSliding || event.button !== 0) return;
	if ((event.target as Element).closest(".calendar-event")) return;
	calendarSliding = true;
	const rail = renderSlidingCalendarTrack();
	if (!rail) return completeCalendarMotion(0);
	calendarSlideToken += 1;
	calendarDrag = {
		pointerId: event.pointerId,
		startX: event.clientX,
		track: rail.track,
		target: rail.target,
		lastPercent: calendarStartPercent,
	};
	rail.target.classList.add("is-dragging");
	rail.target.setPointerCapture(event.pointerId);
	event.preventDefault();
});
calendarTarget.addEventListener("pointermove", (event) => {
	if (!calendarDrag || calendarDrag.pointerId !== event.pointerId) return;
	const width = Math.max(1, calendarDrag.target.clientWidth);
	const percent = clampCalendarPercent(calendarStartPercent + ((event.clientX - calendarDrag.startX) / width) * 100);
	calendarDrag.lastPercent = percent;
	calendarDrag.track.style.transform = calendarTransform(percent);
	event.preventDefault();
});
const finishCalendarDrag = (event: PointerEvent): void => {
	if (!calendarDrag || calendarDrag.pointerId !== event.pointerId) return;
	const drag = calendarDrag;
	calendarDrag = null;
	if (drag.target.hasPointerCapture(event.pointerId)) drag.target.releasePointerCapture(event.pointerId);
	drag.target.classList.remove("is-dragging");
	const dayDelta = dayDeltaFromDrag(drag.startX, event.clientX, drag.target.clientWidth);
	const token = ++calendarSlideToken;
	animateCalendarTrack(
		drag.track,
		drag.lastPercent,
		calendarPercentForDayDelta(dayDelta),
		dayDelta,
		token,
	);
	event.preventDefault();
};
calendarTarget.addEventListener("pointerup", finishCalendarDrag);
calendarTarget.addEventListener("pointercancel", finishCalendarDrag);
calendarTarget.addEventListener("wheel", (event) => {
	if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
	const dayDelta = Math.abs(event.deltaX) >= 36 ? (event.deltaX > 0 ? 1 : -1) : 0;
	if (dayDelta === 0 || event.timeStamp - lastWheelShiftAt < 220) return;
	event.preventDefault();
	lastWheelShiftAt = event.timeStamp;
	shiftCalendarDays(dayDelta);
}, { passive: false });

requiredElement<HTMLButtonElement>("codex-login").addEventListener("click", () => void run({ name: "startCodexLogin" }));
requiredElement<HTMLButtonElement>("codex-refresh").addEventListener("click", () => void run({ name: "refreshCodex" }));
const clearWorkbenchRecords = requiredElement<HTMLButtonElement>("clear-workbench-records");
clearWorkbenchRecords.addEventListener("click", async () => {
	const confirmed = await confirmAction({
		title: "清除演示记录",
		message: "将停止当前执行并清空工作习惯、计划、执行、审批和成果记录。不会删除已生成文件，也不会退出执行代理账号。",
		confirmLabel: "清除并重新开始",
	});
	if (!confirmed) return;
	clearWorkbenchRecords.disabled = true;
	text("today-reason", "正在清除记录并重新启动…");
	try {
		const result = await window.startDay.resetApplicationData();
		if (!result.ok) {
			clearWorkbenchRecords.disabled = false;
			text("today-reason", result.error);
		}
	} catch (error) {
		clearWorkbenchRecords.disabled = false;
		text("today-reason", error instanceof Error ? error.message : "记录清除失败，请重试。");
	}
});
requiredElement<HTMLButtonElement>("start-today-execution").addEventListener("click", () => {
	const goalId = snapshot?.goal?.id;
	const nodeId = snapshot?.nodes.find((node) => node.status === "ready")?.id;
	const allowWebResearch = requiredElement<HTMLInputElement>("allow-web-research").checked;
	if (goalId && nodeId) void run({ name: "startExecution", goalId, nodeId, allowWebResearch });
});
window.startDay.subscribe(() => void reload());
await reload();
