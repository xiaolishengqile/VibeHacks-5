import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { _electron as electron } from "@playwright/test";

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appPath = join(projectRoot, "release", "启动日.app");
const executablePath = join(appPath, "Contents", "MacOS", "启动日");
const codexPath = join(appPath, "Contents", "Resources", "codex", "codex");
const petPath = join(appPath, "Contents", "Resources", "pet", "毛球桌宠.app", "Contents", "MacOS", "毛球桌宠");
const artifactDirectory = join(projectRoot, "artifacts");
const screenshots = {
	workbench: join(artifactDirectory, "startday-workbench.png"),
	mini: join(artifactDirectory, "startday-mini-panel.png"),
	result: join(artifactDirectory, "startday-execution-result.png"),
};

const acceptanceRequest = [
	"请在2026年9月4日18:00（北京时间）前完成季度复盘初稿。",
	"只规划一个由我负责的工作节点，节点标题必须是：创建复盘初稿.md，内容包含“启动日季度复盘真实验收通过”。",
	"工作量30分钟，无依赖、无协作方；执行时只在用户选择的工作目录内创建该文件，不访问网络。",
].join("\n");

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function waitFor(label, check, timeoutMs = 120_000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = null;
	while (Date.now() < deadline) {
		try {
			const value = await check();
			if (value) return value;
		} catch (error) {
			lastError = error;
		}
		await wait(500);
	}
	throw new Error(`${label}超时${lastError instanceof Error ? `：${lastError.message}` : ""}`);
}

async function directoryFingerprint(path) {
	const files = new Map();
	for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const absolute = join(entry.parentPath, entry.name);
		const relative = absolute.slice(path.length + 1);
		files.set(relative, createHash("sha256").update(await readFile(absolute)).digest("hex"));
	}
	return files;
}

function changedFiles(before, after) {
	return [...new Set([...before.keys(), ...after.keys()])]
		.filter((path) => before.get(path) !== after.get(path))
		.sort();
}

async function assertExecutable(path, label) {
	try {
		await access(path, constants.X_OK);
	} catch {
		throw new Error(`${label}不存在或不可执行：${path}`);
	}
}

async function snapshot(page) {
	const result = await page.evaluate(() => window.startDay.getSnapshot());
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

async function launchProduct(root) {
	const profile = join(root, "profile");
	const workspace = join(root, "workspace");
	const outside = join(root, "outside");
	await Promise.all([
		mkdir(profile, { recursive: true }),
		mkdir(workspace, { recursive: true }),
		mkdir(outside, { recursive: true }),
	]);
	await writeFile(join(outside, "哨兵.txt"), "目录外内容不得改变\n", "utf8");

	const pageErrors = [];
	const app = await electron.launch({
		executablePath,
		args: [`--user-data-dir=${profile}`],
		env: { ...process.env },
	});
	const attachDiagnostics = (page) => {
		page.on("pageerror", (error) => pageErrors.push(error.message));
	};
	app.on("window", attachDiagnostics);
	for (const page of app.windows()) attachDiagnostics(page);

	await waitFor("桌面窗口启动", async () => {
		const titles = await Promise.all(app.windows().map((page) => page.title()));
		return titles.includes("启动日工作台") && titles.includes("启动日轻面板");
	}, 45_000);
	const pages = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
	const workbench = pages.find((entry) => entry.title === "启动日工作台")?.page;
	const mini = pages.find((entry) => entry.title === "启动日轻面板")?.page;
	if (!workbench || !mini) throw new Error("找不到启动日桌面窗口");
	await app.evaluate(({ BrowserWindow, dialog }, selectedWorkspace) => {
		dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedWorkspace] });
		for (const window of BrowserWindow.getAllWindows()) window.show();
	}, workspace);
	await waitFor("桌面接口加载", async () => typeof await mini.evaluate(() => window.startDay) === "object", 30_000);
	return { app, mini, workbench, workspace, outside, pageErrors };
}

async function closeProduct(product, root) {
	await product?.app.close().catch(() => undefined);
	await rm(root, { recursive: true, force: true });
}

async function preflight(workspace) {
	await Promise.all([
		assertExecutable(executablePath, "启动日安装包"),
		assertExecutable(codexPath, "安装包内执行代理"),
		assertExecutable(petPath, "安装包内桌宠"),
	]);
	const { stdout } = await run(codexPath, ["--version"], { timeout: 15_000 });
	if (!stdout.trim()) throw new Error("安装包内执行代理没有返回版本");
	const workspaceInfo = await stat(workspace);
	if (!workspaceInfo.isDirectory()) throw new Error("真实验收临时工作目录创建失败");
	const clientModule = pathToFileURL(join(projectRoot, "dist", "src", "codex", "app-server-client.js")).href;
	const { CodexAppServer } = await import(clientModule);
	const server = await CodexAppServer.start(codexPath, "1.0.0-real-acceptance");
	let model = null;
	try {
		const account = await server.account(true);
		if (!account.account) throw new Error("真实验收需要先通过产品登录执行代理账号");
		model = await server.chooseModel();
		if (!model) throw new Error("真实验收账号没有可用模型");
	} finally {
		await server.close();
	}
	console.log("通过：最终安装包、桌宠和执行代理资源完整");
	console.log(`通过：安装包内执行代理可启动（${stdout.trim()}）`);
	console.log("通过：已检测到可用账号和模型");
	console.log("通过：真实验收使用全新临时工作目录");
	return model;
}

async function captureScreenshots(product) {
	await mkdir(artifactDirectory, { recursive: true });
	await product.mini.evaluate(() => window.scrollTo(0, 0));
	await product.mini.screenshot({ path: screenshots.mini, fullPage: false });
	await product.workbench.evaluate(() => window.scrollTo(0, 0));
	await product.workbench.screenshot({
		path: screenshots.workbench,
		fullPage: false,
		mask: [product.workbench.locator("#codex-account")],
		maskColor: "#183326",
	});
	await product.workbench.locator("#artifact-list").screenshot({ path: screenshots.result });
}

async function executeScenario(product) {
	const beforeOutside = await directoryFingerprint(product.outside);
	await mkdir(artifactDirectory, { recursive: true });
	await product.mini.locator("#choose-directory").click();
	await waitFor("工作目录选择", async () => (await snapshot(product.mini)).workDirectory === product.workspace);

	await product.mini.locator("#work-input").fill(acceptanceRequest);
	await product.mini.locator("#submit-work").click();
	const planned = await waitFor("真实模型整理工作计划", async () => {
		const value = await snapshot(product.mini);
		return value.goal && value.nodes.length > 0 ? value : null;
	}, 180_000);
	if (planned.nodes.length !== 1) throw new Error(`真实验收要求一个工作节点，实际得到 ${planned.nodes.length} 个`);
	await product.mini.screenshot({ path: screenshots.mini, fullPage: true });

	await waitFor("执行入口启用", async () => await product.mini.locator("#execution-primary").isEnabled());
	await product.mini.locator("#execution-primary").click();
	await waitFor("执行计划生成", async () => {
		const value = await snapshot(product.mini);
		return value.executions.at(-1)?.status === "awaitingApproval" ? value : null;
	}, 180_000);
	await waitFor("执行计划确认入口", async () =>
		await product.mini.locator("#execution-primary").textContent() === "确认并开始");
	await product.mini.locator("#execution-primary").click();

	const approvedRequests = new Set();
	await waitFor("真实执行和成果验证", async () => {
		const value = await snapshot(product.mini);
		const execution = value.executions.at(-1);
		const approval = value.approvals[0];
		if (approval && !approvedRequests.has(approval.requestId)) {
			approvedRequests.add(approval.requestId);
			const approve = product.mini.getByRole("button", { name: "批准一次" });
			await waitFor("权限批准入口", async () => await approve.isVisible());
			await approve.click();
			return false;
		}
		if (execution?.status === "failed") throw new Error(execution.error ?? "真实执行失败");
		return execution?.status === "succeeded" ? value : null;
	}, 240_000);

	const resultPath = join(product.workspace, "复盘初稿.md");
	const resultText = await readFile(resultPath, "utf8");
	if (!resultText.trim()) throw new Error("真实执行成果为空");
	await captureScreenshots(product);

	const accept = product.mini.getByRole("button", { name: "接受成果" });
	await waitFor("成果接受入口", async () => await accept.isVisible());
	await accept.click();
	const dialog = product.mini.locator("dialog.app-dialog");
	await dialog.getByLabel("记录实际耗时").fill("30");
	await dialog.getByRole("button", { name: "确认" }).click();
	await waitFor("成果接受", async () => (await snapshot(product.mini)).nodes[0]?.status === "done");

	const afterOutside = await directoryFingerprint(product.outside);
	const changes = changedFiles(beforeOutside, afterOutside);
	if (changes.length > 0) throw new Error(`临时工作目录外发生变化：${changes.join("、")}`);
	if (product.pageErrors.length > 0) throw new Error(`界面运行错误：${product.pageErrors.join("；")}`);
	console.log("通过：真实执行代理已创建、验证并接受复盘初稿.md");
	console.log("通过：临时工作目录外没有文件变化");
	console.log("通过：三张最终安装包界面证据已生成");
}

async function verifyExistingScreenshots() {
	for (const [label, path] of Object.entries(screenshots)) {
		const data = await readFile(path);
		if (data.length < 1_024 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
			throw new Error(`${label}界面证据不是有效的非空图片：${path}`);
		}
	}
	console.log("通过：三张最终安装包界面证据存在且格式有效");
}

if (process.argv.includes("--verify-existing")) {
	await verifyExistingScreenshots();
} else {
	const root = await mkdtemp(join(tmpdir(), "startday-real-acceptance-"));
	let product = null;
	try {
		const workspace = join(root, "workspace");
		await mkdir(workspace);
		await preflight(workspace);
		if (!process.argv.includes("--preflight")) {
			product = await launchProduct(root);
			const state = await waitFor("产品执行代理就绪", async () => {
				const value = await snapshot(product.mini);
				return value.codex.account !== "正在检查" ? value.codex : null;
			}, 45_000);
			if (!state.ready) throw new Error(`执行代理当前不可执行：${state.reason}`);
			await executeScenario(product);
		}
	} finally {
		await closeProduct(product, root);
	}
}
