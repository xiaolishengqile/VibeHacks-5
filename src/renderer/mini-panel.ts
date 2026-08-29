import type { ApplicationSnapshot, UiCommand } from "../desktop/application-service.js";
import type { MiniPanelMode } from "../desktop/preload.js";
import { toWeekCalendarView } from "./calendar-view.js";
import { confirmAction, requestText } from "./dialogs.js";
import { clearElement, createTextElement, isSubmitDisabled, requiredElement, setText } from "./dom.js";
import { toPlanResponseText } from "./plan-response-view.js";
import { toExecutionView, toMiniExecutionControl, toTodayActionView } from "./view-models.js";

const actionRisk = requiredElement<HTMLSpanElement>("action-risk");
const actionTime = requiredElement<HTMLTimeElement>("action-time");
const actionTitle = requiredElement<HTMLHeadingElement>("action-title");
const actionReason = requiredElement<HTMLParagraphElement>("action-reason");
const shell = requiredElement<HTMLElement>("mini-shell");
const chatLog = requiredElement<HTMLDivElement>("chat-log");
const input = requiredElement<HTMLTextAreaElement>("work-input");
const submit = requiredElement<HTMLButtonElement>("submit-work");
const message = requiredElement<HTMLParagraphElement>("submit-message");
const planSummary = requiredElement<HTMLParagraphElement>("plan-summary");
const profileSummary = requiredElement<HTMLParagraphElement>("profile-summary");
const confirmProfile = requiredElement<HTMLButtonElement>("confirm-profile");
const progressSummary = requiredElement<HTMLParagraphElement>("progress-summary");
const resultLink = requiredElement<HTMLAnchorElement>("result-link");
const approvalSummary = requiredElement<HTMLParagraphElement>("approval-summary");
const codexStatus = requiredElement<HTMLSpanElement>("codex-status");
const codexLogin = requiredElement<HTMLButtonElement>("codex-login");
const executionPrimary = requiredElement<HTMLButtonElement>("execution-primary");
const executionSecondary = requiredElement<HTMLButtonElement>("execution-secondary");

let busy = false;
let snapshot: ApplicationSnapshot | null = null;
let actionSequence = 0;
let reloadSequence = 0;
let chatInitialized = false;

type ChatRole = "assistant" | "user";

const appendChat = (role: ChatRole, value: string): void => {
	const bubble = createTextElement("p", `chat-message chat-message--${role}`, value);
	chatLog.append(bubble);
	chatLog.scrollTop = role === "assistant"
		? Math.max(0, bubble.offsetTop - chatLog.offsetTop - 2)
		: chatLog.scrollHeight;
};

const ensureChat = (value: ApplicationSnapshot): void => {
	if (chatInitialized) return;
	chatInitialized = true;
	clearElement(chatLog);
	appendChat("assistant", toPlanResponseText(value));
};

const setMessage = (value: string, error = false): void => {
	setText(message, value);
	message.classList.toggle("is-error", error);
};

const updateSubmitState = (): void => {
	submit.disabled = isSubmitDisabled(input.value, busy);
	setText(submit, busy ? "发送中…" : "发送");
};

const resizeWorkInput = (): void => {
	input.style.height = "auto";
	const maxHeight = Number.parseFloat(getComputedStyle(input).maxHeight);
	input.style.height = `${Math.min(input.scrollHeight, Number.isFinite(maxHeight) ? maxHeight : input.scrollHeight)}px`;
};

const handleWorkInput = (): void => {
	resizeWorkInput();
	updateSubmitState();
};

const setMiniPanelMode = (mode: MiniPanelMode): void => {
	shell.dataset.miniMode = mode;
	if (mode === "input") {
		requestAnimationFrame(() => {
			resizeWorkInput();
			input.focus();
		});
	}
};

const run = async (command: UiCommand): Promise<void> => {
	const request = ++actionSequence;
	const result = await window.startDay.runCommand(command);
	if (request !== actionSequence) return;
	if (result.ok) {
		render(result.value);
		setMessage("");
	} else {
		setMessage(result.error, true);
	}
};

const render = (value: ApplicationSnapshot): void => {
	snapshot = value;
	ensureChat(value);
	const calendar = toWeekCalendarView(value);
	const focusDay = calendar.days.find((day) => day.key === calendar.focusDayKey) ?? calendar.days[0];
	setText(requiredElement("mini-calendar-range"), calendar.rangeLabel);
	setText(requiredElement("mini-focus-weekday"), focusDay?.isToday ? "今天" : focusDay?.weekday ?? "今天");
	setText(requiredElement("mini-focus-date"), focusDay?.dateLabel ?? "当前日期");
	const focusItem = focusDay?.items.find((item) => item.id === calendar.focusItemId);
	const today = toTodayActionView(value.decisions[0] ?? null);
	if (today) {
		setText(actionTitle, today.title);
		setText(actionReason, today.reason);
		setText(actionRisk, today.risk);
		setText(actionTime, focusItem?.timeLabel ?? today.latestStart.slice(11, 16));
		actionTime.dateTime = focusItem?.dateTime ?? value.decisions[0]?.latestStart ?? "";
	} else {
		setText(actionTitle, value.goal?.title ?? "告诉我你想完成什么");
		setText(actionReason, value.goal && value.profile && !value.profile.confirmed
			? "请先确认从首个案例建立的工作习惯，再生成行动建议。"
			: "我会整理目标、依赖、等待时间和最晚开始时间。");
		setText(actionRisk, value.goal && value.profile && !value.profile.confirmed ? "待确认习惯" : "暂无计划");
		setText(actionTime, focusDay?.isToday ? "现在" : "");
		actionTime.removeAttribute("datetime");
	}

	setText(
		planSummary,
		value.goal ? `${value.goal.title} · ${value.nodes.length} 个工作节点 · ${value.approvals.length} 项待确认` : "暂无计划。执行前会展示范围并请求确认。",
	);
	setText(profileSummary, value.profile
		? `工作习惯：${value.profile.workdayStart}–${value.profile.workdayEnd} · 每日 ${value.profile.dailyCapacityMinutes} 分钟 · 缓冲 ${value.profile.bufferPercent}%`
		: "提交首个真实工作案例后建立个人工作习惯。");
	confirmProfile.hidden = !value.goal || !value.profile || value.profile.confirmed;
	const execution = value.executions.at(-1);
	const executionView = execution ? toExecutionView(execution) : null;
	setText(progressSummary, executionView ? `${executionView.title} · ${executionView.status} · ${executionView.progress}` : "当前没有执行任务");
	const approval = execution ? value.approvals.find((item) => item.executionId === execution.id) : undefined;
	setText(approvalSummary, approval ? `待确认：${approval.summary}` : "当前没有待确认操作");
	const artifact = execution
		? [...value.artifacts].reverse().find((item) => item.executionId === execution.id)
		: undefined;
	setText(resultLink, artifact ? `成果：${artifact.name}` : "暂无可验收成果");
	resultLink.title = artifact?.path ?? "";
	resultLink.setAttribute("aria-disabled", artifact?.verified ? "false" : "true");

	setText(codexStatus, value.codex.ready ? `代理已就绪 · ${value.codex.model ?? "默认模型"}` : value.codex.reason);
	codexLogin.hidden = !value.codex.canStartBrowserLogin;
	const nodeId = value.nodes.find((node) => node.status === "ready")?.id;
	const active = value.executions.some((item) => !["succeeded", "failed", "canceled"].includes(item.status));
	const control = toMiniExecutionControl({
		execution: execution ?? null,
		hasApproval: Boolean(approval),
		hasVerifiedArtifact: Boolean(artifact?.verified),
		canStart: Boolean(value.goal && value.profile?.confirmed && nodeId && value.codex.ready && !active),
	});
	setText(executionPrimary, control.primaryLabel);
	executionPrimary.disabled = control.primaryAction === null;
	executionPrimary.dataset.action = control.primaryAction ?? "";
	executionSecondary.hidden = control.secondaryAction === null;
	executionSecondary.dataset.action = control.secondaryAction ?? "";
};

const reload = async (): Promise<void> => {
	const request = ++reloadSequence;
	const result = await window.startDay.getSnapshot();
	if (request !== reloadSequence) return;
	if (result.ok) render(result.value);
	else setMessage(result.error, true);
};

input.addEventListener("input", handleWorkInput);
window.startDay.onMiniPanelMode(setMiniPanelMode);
window.startDay.onFocusInput(() => setMiniPanelMode("input"));

const submitCurrentInput = async (): Promise<void> => {
	if (busy || isSubmitDisabled(input.value, false)) return;
	const request = ++actionSequence;
	const userText = input.value.trim();
	const previousSnapshot = snapshot;
	input.value = "";
	busy = true;
	handleWorkInput();
	appendChat("user", userText);
	setMessage("正在拆解并同步到日历…");
	try {
		const result = await window.startDay.submitWorkText(userText);
		if (request !== actionSequence) return;
		if (result.ok) {
			render(result.value);
			appendChat("assistant", toPlanResponseText(result.value, previousSnapshot));
			setMessage("已拆解并同步到日历");
		} else {
			setMessage(result.error, true);
			appendChat("assistant", result.error);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "发送失败，请重试";
		setMessage(errorMessage, true);
		appendChat("assistant", errorMessage);
	} finally {
		busy = false;
		handleWorkInput();
		input.focus();
	}
};

submit.addEventListener("click", () => void submitCurrentInput());
input.addEventListener("keydown", (event) => {
	if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	void submitCurrentInput();
});

requiredElement<HTMLButtonElement>("open-workbench").addEventListener("click", () => {
	void window.startDay.openWorkbench();
});

requiredElement<HTMLButtonElement>("close-mini-panel").addEventListener("click", async () => {
	const result = await window.startDay.hideMiniPanel();
	if (!result.ok) setMessage(result.error, true);
});

const resetApplicationData = requiredElement<HTMLButtonElement>("reset-application-data");
resetApplicationData.addEventListener("click", async () => {
	const confirmed = await confirmAction({
		title: "清理本地数据",
		message: "将停止当前执行并清空工作习惯、计划、执行、审批和成果记录。不会删除已生成文件，也不会退出执行代理账号。",
		confirmLabel: "清理并重新开始",
	});
	if (!confirmed) return;
	resetApplicationData.disabled = true;
	setMessage("正在清理并重新启动…");
	try {
		const result = await window.startDay.resetApplicationData();
		if (!result.ok) {
			resetApplicationData.disabled = false;
			setMessage(result.error, true);
		}
	} catch (error) {
		resetApplicationData.disabled = false;
		setMessage(error instanceof Error ? error.message : "数据清理失败，请重试。", true);
	}
});

confirmProfile.addEventListener("click", () => {
	const goalId = snapshot?.goal?.id;
	if (goalId) void run({ name: "confirmProfile", goalId });
});

requiredElement<HTMLButtonElement>("change-owner").addEventListener("click", async () => {
	const goal = snapshot?.goal;
	const node = snapshot?.nodes.find((item) => item.owner !== "self" && item.status !== "done" && item.status !== "stopped");
	if (!goal || !node) return setMessage("当前没有可更换的协作方。", true);
	const owner = await requestText({
		title: "更换协作方", message: `把“${node.title}”交给谁？`, defaultValue: node.owner,
	});
	if (!owner) return;
	const result = await window.startDay.runCommand({ name: "changeOwner", goalId: goal.id, nodeId: node.id, owner });
	if (result.ok) render(result.value); else setMessage(result.error, true);
});

requiredElement<HTMLButtonElement>("change-deadline").addEventListener("click", async () => {
	const goal = snapshot?.goal;
	if (!goal) return setMessage("当前没有可调整的目标。", true);
	const deadline = await requestText({
		title: "调整截止时间", message: "请输入带时区的完整截止时间", defaultValue: goal.deadline,
	});
	if (!deadline) return;
	const result = await window.startDay.runCommand({ name: "changeDeadline", goalId: goal.id, deadline });
	if (result.ok) render(result.value); else setMessage(result.error, true);
});

requiredElement<HTMLButtonElement>("stop-work").addEventListener("click", async () => {
	const goal = snapshot?.goal;
	const nodeId = snapshot?.decisions[0]?.nodeId;
	if (!goal || !nodeId) return setMessage("当前没有可停止的工作节点。", true);
	const prepared = await window.startDay.runCommand({ name: "prepareStop", goalId: goal.id, nodeId });
	if (!prepared.ok) return setMessage(prepared.error, true);
	const pending = prepared.value.pendingStop;
	if (!pending || !await confirmAction({
		title: "确认停止工作", message: `停止会影响 ${pending.affectedNodeIds.length} 个工作节点。`, confirmLabel: "确认停止",
	})) return;
	const confirmed = await window.startDay.runCommand({ name: "confirmStop", goalId: goal.id, token: pending.token });
	if (confirmed.ok) render(confirmed.value); else setMessage(confirmed.error, true);
});

codexLogin.addEventListener("click", () => void run({ name: "startCodexLogin" }));

executionPrimary.addEventListener("click", async () => {
	const value = snapshot;
	if (!value) return;
	const execution = value.executions.at(-1);
	const approval = execution ? value.approvals.find((item) => item.executionId === execution.id) : undefined;
	const artifact = execution
		? [...value.artifacts].reverse().find((item) => item.executionId === execution.id && item.verified)
		: undefined;
	switch (executionPrimary.dataset.action) {
		case "start": {
			const goalId = value.goal?.id;
			const nodeId = value.nodes.find((node) => node.status === "ready")?.id;
			if (goalId && nodeId) void run({
				name: "startExecution", goalId, nodeId, allowWebResearch: false,
			});
			break;
		}
		case "confirm":
			if (execution) void run({ name: "confirmExecutionPlan", executionId: execution.id });
			break;
		case "approve":
			if (execution && approval) void run({
				name: "answerExecutionApproval", executionId: execution.id, requestId: approval.requestId, decision: "approve",
			});
			break;
		case "cancel":
			if (execution) void run({ name: "cancelExecution", executionId: execution.id });
			break;
		case "resume":
			if (execution) void run({ name: "resumeExecution", executionId: execution.id });
			break;
		case "accept": {
			if (!execution || !artifact) break;
			const minutes = Number(await requestText({
				title: "记录实际耗时", message: "请输入这项工作的实际耗时（分钟）", defaultValue: "60", inputType: "number",
			}));
			if (Number.isInteger(minutes) && minutes > 0) void run({
				name: "acceptExecutionArtifact", executionId: execution.id, artifactId: artifact.id, actualMinutes: minutes,
			});
			break;
		}
	}
});

executionSecondary.addEventListener("click", () => {
	const execution = snapshot?.executions.at(-1);
	const approval = execution ? snapshot?.approvals.find((item) => item.executionId === execution.id) : undefined;
	if (executionSecondary.dataset.action === "deny" && execution && approval) void run({
		name: "answerExecutionApproval", executionId: execution.id, requestId: approval.requestId, decision: "deny",
	});
});

resultLink.addEventListener("click", (event) => {
	event.preventDefault();
	const execution = snapshot?.executions.at(-1);
	const artifact = execution
		? [...(snapshot?.artifacts ?? [])].reverse().find((item) => item.executionId === execution.id && item.verified)
		: undefined;
	if (execution && artifact) void run({ name: "openExecutionArtifact", executionId: execution.id, artifactId: artifact.id });
});

window.startDay.subscribe(() => void reload());
handleWorkInput();
await reload();
