import { expect, test } from "./fixtures.js";

test("季度复盘从输入到两个成果验收形成完整闭环", async ({ startDay }) => {
	await startDay.submit("下周五做季度复盘，周三老板先看，数据找小王，先帮我搭框架");
	await startDay.expectNode("找协作方拿数据", "ready");
	await startDay.changeFirstCollaborator("小赵");
	await startDay.chooseFixtureWorkspace();
	await startDay.executeAndAcceptCurrent(25);
	await startDay.expectNode("找协作方拿数据", "done");
	await startDay.executeAndAcceptCurrent(70);
	await startDay.expectNode("搭建复盘框架", "done");
});

test("停止上游工作会确认并停止受影响节点", async ({ startDay }) => {
	await startDay.submit("下周五完成季度复盘");
	await startDay.stopCurrentAndConfirm();
	await startDay.expectAllNodes("stopped");
});

test.describe("执行异常", () => {
	test.use({ fakeMode: "slow" });
	test("运行中的任务可以取消", async ({ startDay }) => {
		await startDay.submit("下周五完成季度复盘");
		await startDay.chooseFixtureWorkspace();
		await startDay.startAndConfirmExecution();
		await startDay.cancelExecution();
		await startDay.expectExecution("canceled");
	});
});

test.describe("执行失败", () => {
	test.use({ fakeMode: "failure" });
	test("代理失败会形成明确失败状态", async ({ startDay }) => {
		await startDay.submit("下周五完成季度复盘");
		await startDay.chooseFixtureWorkspace();
		await startDay.startAndConfirmExecution();
		await startDay.expectExecution("failed");
	});
});

test("同一隔离资料目录重启后恢复工作计划", async ({ startDay }) => {
	await startDay.submit("下周五完成季度复盘");
	await startDay.restart();
	await startDay.expectNode("找协作方拿数据", "ready");
});

test("桌宠入口事件会显示轻面板", async ({ startDay }) => {
	await startDay.hideMiniPanel();
	await startDay.triggerPetOpenPanel();
	await expect.poll(() => startDay.isMiniPanelVisible()).toBe(true);
});

test("长目录和代理状态不会撑破轻面板且关闭后可由桌宠重新打开", async ({ startDay }) => {
	await startDay.submit("下周五完成季度复盘");
	await startDay.chooseFixtureWorkspace();
	await startDay.expectMiniPanelFitsViewport();
	await startDay.closeMiniPanelFromButton();
	await expect.poll(() => startDay.isMiniPanelVisible()).toBe(false);
	await startDay.triggerPetOpenPanel();
	await expect.poll(() => startDay.isMiniPanelVisible()).toBe(true);
});
