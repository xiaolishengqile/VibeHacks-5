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

test("轻面板和完整工作台使用明亮的日历布局", async ({ startDay }) => {
	await startDay.submit("下周五做季度复盘，周三老板先看，数据找小王，先帮我搭框架");

	const weekCalendar = startDay.workbench.getByRole("region", { name: "周日历" });
	await expect(weekCalendar).toBeVisible();
	await expect(weekCalendar.locator(".calendar-day")).toHaveCount(7);
	await expect(weekCalendar.getByText("找协作方拿数据")).toBeVisible();
	await expect(startDay.mini.getByRole("region", { name: "当日日程" })).toBeVisible();
	await expect(startDay.mini.getByText("找协作方拿数据")).toBeVisible();
	const workbenchLayout = await startDay.workbench.evaluate(() => ({
		colorScheme: getComputedStyle(document.documentElement).colorScheme,
		background: getComputedStyle(document.documentElement).backgroundColor,
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
		days: [...document.querySelectorAll<HTMLElement>(".calendar-day")].map((day) => {
			const rect = day.getBoundingClientRect();
			return { left: rect.left, right: rect.right, width: rect.width };
		}),
	}));
	const miniLayout = await startDay.mini.evaluate(() => ({
		colorScheme: getComputedStyle(document.documentElement).colorScheme,
		background: getComputedStyle(document.documentElement).backgroundColor,
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}));
	for (const layout of [workbenchLayout, miniLayout]) {
		expect(layout.colorScheme).toBe("light");
		expect(layout.background).toBe("rgb(245, 245, 247)");
		expect(layout.scrollWidth).toBe(layout.clientWidth);
	}
	expect(new Set(workbenchLayout.days.map((day) => Math.round(day.left))).size).toBe(7);
	expect(workbenchLayout.days.every((day) => day.width >= 100)).toBe(true);
	expect(workbenchLayout.days[0]?.left).toBeGreaterThanOrEqual(0);
	expect(workbenchLayout.days.at(-1)?.right).toBeLessThanOrEqual(workbenchLayout.clientWidth);
});

test("长目录和代理状态不会撑破轻面板且关闭后可由桌宠重新打开", async ({ startDay }) => {
	await startDay.submit("下周五完成季度复盘");
	await startDay.chooseFixtureWorkspace();
	await startDay.expectMiniPanelFitsViewport();
	await startDay.expectMiniPanelHasContinuousSurface();
	await startDay.closeMiniPanelFromButton();
	await expect.poll(() => startDay.isMiniPanelVisible()).toBe(false);
	await startDay.triggerPetOpenPanel();
	await expect.poll(() => startDay.isMiniPanelVisible()).toBe(true);
});

test("轻面板提供明确可用的关闭按钮和位于左侧的清理入口", async ({ startDay }) => {
	const reset = startDay.mini.getByRole("button", { name: "清理数据" });
	const close = startDay.mini.getByRole("button", { name: "关闭轻面板" });

	await expect(reset).toBeVisible();
	await expect(close).toBeEnabled();
	await expect(close).toHaveAttribute("title", /桌宠继续运行/);
	const [resetBox, closeBox] = await Promise.all([reset.boundingBox(), close.boundingBox()]);
	expect(resetBox).not.toBeNull();
	expect(closeBox).not.toBeNull();
	expect((resetBox?.x ?? 0) + (resetBox?.width ?? 0)).toBeLessThanOrEqual(closeBox?.x ?? 0);

	await reset.click();
	const dialog = startDay.mini.locator("dialog.app-dialog");
	await expect(dialog).toContainText("不会删除已生成文件，也不会退出执行代理账号");
	await dialog.getByRole("button", { name: "取消" }).click();
	await expect(dialog).toHaveCount(0);
});

test.describe("清理运行中的数据", () => {
	test.use({ fakeMode: "slow" });
	test("确认清理会停止代理、保留文件并恢复首次使用状态", async ({ startDay }) => {
		await startDay.submit("下周五完成季度复盘");
		await startDay.chooseFixtureWorkspace();
		await startDay.startAndConfirmExecution();
		await expect.poll(() => startDay.workspaceFileExists("运行中草稿.md")).toBe(true);
		await expect.poll(async () => (await startDay.snapshot()).approvals.length).toBe(1);
		await expect.poll(async () => (await startDay.snapshot()).artifacts.length).toBe(1);
		const before = await startDay.snapshot();
		expect(before.approvals).not.toEqual([]);
		expect(before.artifacts).not.toEqual([]);
		expect(before.codex.account).toBe("test@example.com");
		expect(await startDay.loginStateExists()).toBe(true);
		const previousAgentPid = await startDay.executionAgentProcessId();

		await startDay.resetApplicationDataAndRestart();

		await expect.poll(() => startDay.isProcessRunning(previousAgentPid)).toBe(false);
		expect(await startDay.workspaceFileExists("运行中草稿.md")).toBe(true);
		expect(await startDay.loginStateExists()).toBe(true);
		const snapshot = await startDay.snapshot();
		expect(snapshot.goal).toBeNull();
		expect(snapshot.profile).toBeNull();
		expect(snapshot.nodes).toEqual([]);
		expect(snapshot.executions).toEqual([]);
		expect(snapshot.approvals).toEqual([]);
		expect(snapshot.artifacts).toEqual([]);
		expect(snapshot.codex.ready).toBe(true);
		expect(snapshot.codex.account).toBe("test@example.com");
	});
});
