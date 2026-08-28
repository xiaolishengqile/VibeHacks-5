import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from "@playwright/test";

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(projectRoot, "release", "启动日.app", "Contents", "MacOS", "启动日");
const fakeCodex = join(projectRoot, "tests", "e2e", "fake-codex.mjs");

type FakeMode = "success" | "slow" | "failure";
type Snapshot = {
	goal: { id: string; title: string } | null;
	profile: { confirmed: boolean } | null;
	nodes: ReadonlyArray<{ id: string; title: string; status: string; owner: string }>;
	executions: ReadonlyArray<{ id: string; status: string }>;
	approvals: ReadonlyArray<{ executionId: string; requestId: string }>;
	artifacts: ReadonlyArray<{ id: string; executionId: string; verified: boolean }>;
};

export class StartDayHarness {
	app!: ElectronApplication;
	workbench!: Page;
	mini!: Page;
	readonly profile: string;
	readonly workspace: string;
	readonly fakeMode: FakeMode;

	private constructor(profile: string, workspace: string, fakeMode: FakeMode) {
		this.profile = profile;
		this.workspace = workspace;
		this.fakeMode = fakeMode;
	}

	static async launch(fakeMode: FakeMode): Promise<StartDayHarness> {
		const root = await mkdtemp(join(tmpdir(), "startday-e2e-"));
		const harness = new StartDayHarness(join(root, "profile"), join(root, "workspace"), fakeMode);
		await Promise.all([mkdir(harness.profile), mkdir(harness.workspace), chmod(fakeCodex, 0o755)]);
		await harness.#launchApplication();
		return harness;
	}

	async close(): Promise<void> {
		await this.app.close().catch(() => undefined);
		await rm(dirname(this.profile), { recursive: true, force: true });
	}

	async restart(): Promise<void> {
		await this.app.close();
		await this.#launchApplication();
	}

	async submit(text: string): Promise<void> {
		await this.mini.getByPlaceholder(/例如/).fill(text);
		await this.mini.getByRole("button", { name: "整理计划" }).click();
		await expect.poll(async () => (await this.snapshot()).goal?.title).toBe("季度复盘");
		await expect(this.mini.locator("#submit-message")).toHaveText("计划已更新，请检查后再开始执行。");
		await expect(this.mini.getByRole("button", { name: "确认工作习惯" })).toBeVisible();
		await this.mini.getByRole("button", { name: "确认工作习惯" }).click();
		await expect.poll(async () => (await this.snapshot()).profile?.confirmed).toBe(true);
	}

	async changeFirstCollaborator(owner: string): Promise<void> {
		await this.mini.getByRole("button", { name: "更换协作方" }).click();
		const dialog = this.mini.locator("dialog.app-dialog");
		await dialog.getByLabel("更换协作方").fill(owner);
		await dialog.getByRole("button", { name: "确认" }).click();
		await expect.poll(async () => (await this.snapshot()).nodes[0]?.owner).toBe(owner);
	}

	async chooseFixtureWorkspace(): Promise<void> {
		await this.mini.getByRole("button", { name: "选择目录" }).click();
		await expect(this.mini.getByText(`工作目录：${this.workspace}`)).toBeVisible();
	}

	async startAndConfirmExecution(): Promise<void> {
		const miniStart = this.mini.getByRole("button", { name: "生成执行计划" });
		if (await miniStart.count() > 0 && await miniStart.isEnabled()) await miniStart.click();
		else await this.workbench.getByRole("button", { name: "生成执行计划" }).click();
		await expect.poll(async () => (await this.snapshot()).executions.at(-1)?.status).toBe("awaitingApproval");
		await this.mini.getByRole("button", { name: "确认并开始" }).click();
	}

	async executeAndAcceptCurrent(actualMinutes: number): Promise<void> {
		await this.startAndConfirmExecution();
		await expect.poll(async () => (await this.snapshot()).approvals.length).toBe(1);
		await this.mini.getByRole("button", { name: "批准一次" }).click();
		await this.expectExecution("succeeded");
		await this.mini.getByRole("button", { name: "接受成果" }).click();
		const dialog = this.mini.locator("dialog.app-dialog");
		await dialog.getByLabel("记录实际耗时").fill(String(actualMinutes));
		await dialog.getByRole("button", { name: "确认" }).click();
		await expect.poll(async () => (await this.snapshot()).nodes.some((node) => node.status === "done")).toBe(true);
	}

	async cancelExecution(): Promise<void> {
		await expect(this.workbench.getByRole("button", { name: "取消执行" }).last()).toBeVisible();
		await this.workbench.getByRole("button", { name: "取消执行" }).last().click();
	}

	async stopCurrentAndConfirm(): Promise<void> {
		await this.mini.getByRole("button", { name: "停止节点" }).click();
		await this.mini.locator("dialog.app-dialog").getByRole("button", { name: "确认停止" }).click();
	}

	async expectNode(title: string, status: string): Promise<void> {
		await expect.poll(async () => (await this.snapshot()).nodes.find((node) => node.title === title)?.status).toBe(status);
	}

	async expectAllNodes(status: string): Promise<void> {
		await expect.poll(async () => (await this.snapshot()).nodes.every((node) => node.status === status)).toBe(true);
	}

	async expectExecution(status: string): Promise<void> {
		await expect.poll(async () => (await this.snapshot()).executions.at(-1)?.status).toBe(status);
	}

	async hideMiniPanel(): Promise<void> {
		await this.app.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows().find((window) => window.getTitle() === "启动日轻面板")?.hide();
		});
	}

	async closeMiniPanelFromButton(): Promise<void> {
		await this.mini.getByRole("button", { name: "关闭轻面板" }).click();
	}

	async expectMiniPanelFitsViewport(): Promise<void> {
		await expect.poll(() => this.mini.evaluate(() => ({
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
			widestRight: Math.max(...[...document.querySelectorAll<HTMLElement>("main *")]
				.map((element) => element.getBoundingClientRect().right)),
		}))).toEqual({ clientWidth: 420, scrollWidth: 420, widestRight: expect.any(Number) });
		const widestRight = await this.mini.evaluate(() => Math.max(
			...[...document.querySelectorAll<HTMLElement>("main *")].map((element) => element.getBoundingClientRect().right),
		));
		expect(widestRight).toBeLessThanOrEqual(420);
	}

	async expectMiniPanelHasContinuousSurface(): Promise<void> {
		const metrics = await this.mini.evaluate(async () => {
			const bodyStyle = getComputedStyle(document.body);
			const shell = document.querySelector<HTMLElement>(".shell--mini");
			if (!shell) throw new Error("找不到轻面板外框");
			const documentScrollHeight = document.documentElement.scrollHeight;
			const viewportHeight = window.innerHeight;
			const maxScroll = documentScrollHeight - viewportHeight;
			const shellBottoms: number[] = [];
			for (const position of [0, maxScroll / 2, maxScroll]) {
				window.scrollTo(0, position);
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				shellBottoms.push(shell.getBoundingClientRect().bottom);
			}
			window.scrollTo(0, 0);
			return {
				bodyBorderBottomWidth: bodyStyle.borderBottomWidth,
				bodyHeight: document.body.getBoundingClientRect().height,
				bodyScrollHeight: document.body.scrollHeight,
				documentScrollHeight,
				viewportHeight,
				maxScroll,
				shellBorderBottomWidth: getComputedStyle(shell).borderBottomWidth,
				shellBottoms,
			};
		});
		expect(metrics.bodyBorderBottomWidth).toBe("0px");
		expect(metrics.bodyHeight).toBeGreaterThanOrEqual(metrics.bodyScrollHeight - 1);
		expect(metrics.bodyScrollHeight).toBe(metrics.documentScrollHeight);
		expect(metrics.maxScroll).toBeGreaterThan(50);
		expect(metrics.shellBorderBottomWidth).toBe("1px");
		expect(metrics.shellBottoms[0]).toBeGreaterThan(metrics.viewportHeight + 50);
		expect(metrics.shellBottoms[1]).toBeGreaterThan(metrics.viewportHeight + 20);
		expect(Math.abs((metrics.shellBottoms[2] ?? 0) - metrics.viewportHeight)).toBeLessThanOrEqual(2);
	}

	async isMiniPanelVisible(): Promise<boolean> {
		return this.app.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows().find((window) => window.getTitle() === "启动日轻面板")?.isVisible() ?? false);
	}

	async triggerPetOpenPanel(): Promise<void> {
		const process = this.app.process();
		const { stdout: children } = await run("pgrep", ["-P", String(process.pid)]);
		for (const pid of children.trim().split(/\s+/)) {
			const { stdout } = await run("ps", ["eww", "-p", pid, "-o", "command="]);
			if (!stdout.includes("毛球桌宠")) continue;
			const port = /STARTDAY_BRIDGE_PORT=(\d+)/.exec(stdout)?.[1];
			const token = /STARTDAY_BRIDGE_TOKEN=([a-f0-9]{64})/.exec(stdout)?.[1];
			if (!port || !token) break;
			const response = await fetch(`http://127.0.0.1:${port}/event`, {
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({ type: "open_panel" }),
			});
			if (!response.ok) throw new Error("桌宠入口事件发送失败");
			return;
		}
		throw new Error("找不到端到端桌宠进程");
	}

	async snapshot(): Promise<Snapshot> {
		const result = await this.mini.evaluate(async () => window.startDay.getSnapshot());
		if (!result.ok) throw new Error(result.error);
		return result.value as Snapshot;
	}

	async #launchApplication(): Promise<void> {
		this.app = await electron.launch({
			executablePath,
			args: [`--user-data-dir=${this.profile}`],
			env: { ...process.env, STARTDAY_CODEX_PATH: fakeCodex, STARTDAY_FAKE_MODE: this.fakeMode },
		});
		await expect.poll(async () => (await Promise.all(this.app.windows().map((page) => page.title()))).sort()).toEqual([
			"启动日工作台", "启动日轻面板",
		]);
		let workbench: Page | null = null;
		let mini: Page | null = null;
		for (const page of this.app.windows()) {
			const title = await page.title();
			if (title === "启动日工作台") workbench = page;
			if (title === "启动日轻面板") mini = page;
		}
		if (!workbench || !mini) throw new Error("找不到启动日桌面窗口");
		this.workbench = workbench;
		this.mini = mini;
		await this.app.evaluate(({ BrowserWindow, dialog }, workspace) => {
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
			for (const window of BrowserWindow.getAllWindows()) window.show();
		}, this.workspace);
		await expect.poll(async () => typeof await this.mini.evaluate(() => window.startDay)).toBe("object");
	}
}

type Fixtures = { startDay: StartDayHarness; fakeMode: FakeMode };

export const test = base.extend<Fixtures>({
	fakeMode: ["success", { option: true }],
	startDay: async ({ fakeMode }, use) => {
		const harness = await StartDayHarness.launch(fakeMode);
		try { await use(harness); }
		finally { await harness.close(); }
	},
});

export { expect };
