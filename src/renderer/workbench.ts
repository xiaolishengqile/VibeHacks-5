import type { ApplicationSnapshot } from "../desktop/application-service.js";
import { clearElement, createTextElement, renderEmpty, requiredElement, setText } from "./dom.js";
import { toExecutionView, toGraphView, toTodayActionView } from "./view-models.js";

const text = (id: string, value: string): void => setText(requiredElement(id), value);

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

const render = (snapshot: ApplicationSnapshot): void => {
	text("goal-title", snapshot.goal?.title ?? "把想法变成今天能推进的工作");
	text("goal-deadline", snapshot.goal ? `目标截止：${snapshot.goal.deadline}` : "输入工作想法后，这里会展示完整计划。");
	const today = toTodayActionView(snapshot.decisions[0] ?? null);
	text("today-title", today?.title ?? "暂无当前行动");
	text("today-risk", today?.risk ?? "等待输入");
	text("today-time", today ? `最晚 ${today.latestStart}` : "");
	text("today-reason", today?.reason ?? "从桌宠打开轻面板，输入你想完成的工作。");
	text("decision-explanation", today?.reason ?? "暂无可解释的排期决策");

	const graph = toGraphView(snapshot);
	text("graph-count", `${graph.length} 个节点`);
	renderCards("graph-list", graph.map((node) => ({
		title: `${node.title} · ${node.status}`,
		detail: `负责人：${node.owner} · 依赖 ${node.dependencies.length} 项${node.latestStart ? ` · 最晚 ${node.latestStart}` : ""}`,
	})), "暂无工作节点");

	renderCards("waiting-list", snapshot.nodes
		.filter((node) => node.owner !== "self" && node.status !== "done" && node.status !== "stopped")
		.map((node) => ({ title: node.title, detail: `等待 ${node.owner} · 预计 ${node.waitMinutes} 分钟` })), "暂无等待事项");
	renderCards("execution-list", snapshot.executions.map((item) => {
		const view = toExecutionView(item);
		return { title: `${view.title} · ${view.status}`, detail: `${view.progress} · ${view.updatedAt}` };
	}), "当前没有执行任务");
	renderCards("approval-list", snapshot.approvals.map((item) => ({
		title: `${item.risk === "high" ? "高风险" : item.risk === "medium" ? "中风险" : "低风险"}确认`,
		detail: item.summary,
	})), "当前没有待确认操作");
	renderCards("artifact-list", snapshot.artifacts.map((item) => ({
		title: `${item.name}${item.verified ? " · 已验证" : " · 待验证"}`,
		detail: item.path,
	})), "当前没有可验收成果");
	renderCards("history-list", [
		...snapshot.changes.map((item) => ({ title: item.reason, detail: item.createdAt })),
		...snapshot.events.map((item) => ({ title: item.message, detail: item.at })),
	].slice(-20).reverse(), "当前没有历史记录");
};

const reload = async (): Promise<void> => {
	const result = await window.startDay.getSnapshot();
	if (result.ok) render(result.value);
	else text("today-reason", result.error);
};

requiredElement<HTMLButtonElement>("workbench-directory").addEventListener("click", async () => {
	await window.startDay.chooseWorkDirectory();
	await reload();
});

window.startDay.subscribe(() => void reload());
await reload();
