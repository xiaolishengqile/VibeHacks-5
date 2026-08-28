import type { ApplicationSnapshot, UiCommand } from "../desktop/application-service.js";
import { confirmAction, requestText } from "./dialogs.js";
import { isSubmitDisabled, requiredElement, setText } from "./dom.js";
import { toExecutionView, toMiniExecutionControl, toTodayActionView } from "./view-models.js";

const actionRisk = requiredElement<HTMLSpanElement>("action-risk");
const actionTime = requiredElement<HTMLSpanElement>("action-time");
const actionTitle = requiredElement<HTMLHeadingElement>("action-title");
const actionReason = requiredElement<HTMLParagraphElement>("action-reason");
const input = requiredElement<HTMLTextAreaElement>("work-input");
const submit = requiredElement<HTMLButtonElement>("submit-work");
const message = requiredElement<HTMLParagraphElement>("submit-message");
const planSummary = requiredElement<HTMLParagraphElement>("plan-summary");
const directorySummary = requiredElement<HTMLParagraphElement>("directory-summary");
const progressSummary = requiredElement<HTMLParagraphElement>("progress-summary");
const resultLink = requiredElement<HTMLAnchorElement>("result-link");
const approvalSummary = requiredElement<HTMLParagraphElement>("approval-summary");
const codexStatus = requiredElement<HTMLSpanElement>("codex-status");
const codexLogin = requiredElement<HTMLButtonElement>("codex-login");
const executionPrimary = requiredElement<HTMLButtonElement>("execution-primary");
const executionSecondary = requiredElement<HTMLButtonElement>("execution-secondary");

let busy = false;
let snapshot: ApplicationSnapshot | null = null;
let requestSequence = 0;

const setMessage = (value: string, error = false): void => {
	setText(message, value);
	message.classList.toggle("is-error", error);
};

const updateSubmitState = (): void => {
	submit.disabled = isSubmitDisabled(input.value, busy);
	setText(submit, busy ? "正在整理…" : "整理计划");
};

const run = async (command: UiCommand): Promise<void> => {
	const request = ++requestSequence;
	const result = await window.startDay.runCommand(command);
	if (request !== requestSequence) return;
	if (result.ok) {
		render(result.value);
		setMessage("操作已更新。");
	} else {
		setMessage(result.error, true);
	}
};

const render = (value: ApplicationSnapshot): void => {
	snapshot = value;
	const today = toTodayActionView(value.decisions[0] ?? null);
	if (today) {
		setText(actionTitle, today.title);
		setText(actionReason, today.reason);
		setText(actionRisk, today.risk);
		setText(actionTime, `最晚 ${today.latestStart}`);
	} else {
		setText(actionTitle, value.goal?.title ?? "告诉我你想完成什么");
		setText(actionReason, "我会整理目标、依赖、等待时间和最晚开始时间。");
		setText(actionRisk, "暂无计划");
		setText(actionTime, "");
	}

	setText(
		planSummary,
		value.goal ? `${value.goal.title} · ${value.nodes.length} 个工作节点 · ${value.approvals.length} 项待确认` : "暂无计划。执行前会展示范围并请求确认。",
	);
	setText(directorySummary, value.workDirectory ? `工作目录：${value.workDirectory}` : "尚未选择工作目录");
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
		canStart: Boolean(value.goal && nodeId && value.workDirectory && value.codex.ready && !active),
	});
	setText(executionPrimary, control.primaryLabel);
	executionPrimary.disabled = control.primaryAction === null;
	executionPrimary.dataset.action = control.primaryAction ?? "";
	executionSecondary.hidden = control.secondaryAction === null;
	executionSecondary.dataset.action = control.secondaryAction ?? "";
};

const reload = async (): Promise<void> => {
	const request = ++requestSequence;
	const result = await window.startDay.getSnapshot();
	if (request !== requestSequence) return;
	if (result.ok) render(result.value);
	else setMessage(result.error, true);
};

input.addEventListener("input", updateSubmitState);
submit.addEventListener("click", async () => {
	const request = ++requestSequence;
	busy = true;
	updateSubmitState();
	setMessage("正在理解目标并生成计划…");
	const result = await window.startDay.submitWorkText(input.value);
	busy = false;
	updateSubmitState();
	if (request !== requestSequence) {
		if (result.ok) setMessage("计划已更新，请检查后再开始执行。");
		else setMessage(result.error, true);
		return;
	}
	if (result.ok) {
		render(result.value);
		setMessage("计划已更新，请检查后再开始执行。");
	} else {
		setMessage(result.error, true);
	}
});

requiredElement<HTMLButtonElement>("open-workbench").addEventListener("click", () => {
	void window.startDay.openWorkbench();
});

requiredElement<HTMLButtonElement>("close-mini-panel").addEventListener("click", () => {
	void window.startDay.hideMiniPanel();
});

requiredElement<HTMLButtonElement>("choose-directory").addEventListener("click", async () => {
	const result = await window.startDay.chooseWorkDirectory();
	if (!result.ok) setMessage(result.error, true);
	else await reload();
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
updateSubmitState();
await reload();
