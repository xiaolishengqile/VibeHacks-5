import type { ApplicationSnapshot } from "../desktop/application-service.js";
import { isSubmitDisabled, requiredElement, setText } from "./dom.js";
import { toTodayActionView } from "./view-models.js";

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

let busy = false;
let snapshot: ApplicationSnapshot | null = null;

const setMessage = (value: string, error = false): void => {
	setText(message, value);
	message.classList.toggle("is-error", error);
};

const updateSubmitState = (): void => {
	submit.disabled = isSubmitDisabled(input.value, busy);
	setText(submit, busy ? "正在整理…" : "整理计划");
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
	setText(progressSummary, execution ? `${execution.title} · ${execution.progress}` : "当前没有执行任务");
	const artifact = value.artifacts.at(-1);
	setText(resultLink, artifact ? `成果：${artifact.name}` : "暂无可验收成果");
	resultLink.title = artifact?.path ?? "";
	resultLink.setAttribute("aria-disabled", artifact ? "false" : "true");
};

const reload = async (): Promise<void> => {
	const result = await window.startDay.getSnapshot();
	if (result.ok) render(result.value);
	else setMessage(result.error, true);
};

input.addEventListener("input", updateSubmitState);
submit.addEventListener("click", async () => {
	busy = true;
	updateSubmitState();
	setMessage("正在理解目标并生成计划…");
	const result = await window.startDay.submitWorkText(input.value);
	busy = false;
	updateSubmitState();
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

requiredElement<HTMLButtonElement>("choose-directory").addEventListener("click", async () => {
	const result = await window.startDay.chooseWorkDirectory();
	if (!result.ok) setMessage(result.error, true);
	else await reload();
});

requiredElement<HTMLButtonElement>("change-owner").addEventListener("click", async () => {
	const goal = snapshot?.goal;
	const node = snapshot?.nodes.find((item) => item.owner !== "self" && item.status !== "done" && item.status !== "stopped");
	if (!goal || !node) return setMessage("当前没有可更换的协作方。", true);
	const owner = window.prompt(`把“${node.title}”交给谁？`, node.owner)?.trim();
	if (!owner) return;
	const result = await window.startDay.runCommand({ name: "changeOwner", goalId: goal.id, nodeId: node.id, owner });
	if (result.ok) render(result.value); else setMessage(result.error, true);
});

requiredElement<HTMLButtonElement>("change-deadline").addEventListener("click", async () => {
	const goal = snapshot?.goal;
	if (!goal) return setMessage("当前没有可调整的目标。", true);
	const deadline = window.prompt("请输入新的截止时间", goal.deadline)?.trim();
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
	if (!pending || !window.confirm(`停止会影响 ${pending.affectedNodeIds.length} 个工作节点，是否继续？`)) return;
	const confirmed = await window.startDay.runCommand({ name: "confirmStop", goalId: goal.id, token: pending.token });
	if (confirmed.ok) render(confirmed.value); else setMessage(confirmed.error, true);
});

resultLink.addEventListener("click", (event) => {
	event.preventDefault();
	const artifact = snapshot?.artifacts.at(-1);
	if (artifact) setMessage(`成果位置：${artifact.path}`);
});

window.startDay.subscribe(() => void reload());
updateSubmitState();
await reload();
