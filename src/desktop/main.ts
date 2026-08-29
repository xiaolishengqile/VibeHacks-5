import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { RandomIdGenerator } from "../shared/ids.js";
import { clearApplicationData, migrateDatabase, openDatabase } from "../storage/database.js";
import { SqliteWorkRepository } from "../storage/work-repository.js";
import { SqliteExecutionRepository } from "../storage/execution-repository.js";
import { CommandService } from "../work/command-service.js";
import { DecisionEngine } from "../work/decision-engine.js";
import { createProfile } from "../work/profile.js";
import { ApplicationService } from "./application-service.js";
import { FallbackWorkBackend } from "./core-application.js";
import { CodexAppServer } from "../codex/app-server-client.js";
import { locateCodex } from "../codex/codex-locator.js";
import { CodexSetup } from "./codex-setup.js";
import { createDesktopExecutionRuntime } from "./codex-runtime.js";
import { IntegratedDesktopBackend } from "./integrated-backend.js";
import { CommandWorkExecutionPort } from "../work/execution-port.js";
import { registerDesktopIpc } from "./ipc.js";
import { channels } from "./channels.js";
import { PetBridge } from "./pet-bridge.js";
import { PetProcess } from "./pet-process.js";
import { runApplicationReset } from "./reset-application-data.js";
import { toPetStatus } from "../renderer/view-models.js";

import {
	createMiniPanelWindow,
	createWorkbenchWindow,
	registerWindowShortcuts,
	screenCornerForPoint,
	showMiniPanelNearPet,
} from "./windows.js";

let workbench: BrowserWindow | null = null;
let miniPanel: BrowserWindow | null = null;
let closeIpc: (() => void) | null = null;
let closeDatabase: (() => void) | null = null;
let closePetEvents: (() => void) | null = null;
let closeShortcuts: (() => void) | null = null;
let shutdownStarted = false;

const createWindows = (): void => {
	if (!workbench || workbench.isDestroyed()) workbench = createWorkbenchWindow(BrowserWindow);
	if (!miniPanel || miniPanel.isDestroyed()) miniPanel = createMiniPanelWindow(BrowserWindow);
};

const openMiniPanelNearCursor = (): void => {
	createWindows();
	if (!miniPanel) return;
	const cursor = screen.getCursorScreenPoint();
	const workArea = screen.getDisplayNearestPoint(cursor).workArea;
	showMiniPanelNearPet(miniPanel, workArea, screenCornerForPoint(cursor, workArea));
};

const openWorkbenchWindow = (): void => {
	createWindows();
	workbench?.show();
	workbench?.focus();
};

const openMiniInputNearCursor = (): void => {
	openMiniPanelNearCursor();
	miniPanel?.webContents.send(channels.focusInput);
};

const startDesktop = async (): Promise<void> => {
	const bridge = await PetBridge.start();
	const petProcess = new PetProcess({
		packaged: app.isPackaged,
		projectRoot: app.getAppPath(),
		resourcesPath: process.resourcesPath,
	});
	closePetEvents = bridge.onEvent((event) => {
		if (event.type === "quit_requested") return app.quit();
		if (event.type === "open_panel") openMiniPanelNearCursor();
		if (event.type === "open_today") openMiniPanelNearCursor();
		if (event.type === "open_input") openMiniInputNearCursor();
		if (event.type === "open_workbench") openWorkbenchWindow();
	});
	petProcess.start({ port: bridge.port, token: bridge.token });

	const database = openDatabase(join(app.getPath("userData"), "startday.sqlite"));
	migrateDatabase(database);
	closeDatabase = () => database.close();
	const repository = new SqliteWorkRepository(database);
	const executionRepository = new SqliteExecutionRepository(database);
	const interpreterDirectory = join(app.getPath("userData"), "work-interpreter");
	const generatedWorkDirectory = join(app.getPath("userData"), "generated-work");
	mkdirSync(interpreterDirectory, { recursive: true, mode: 0o700 });
	mkdirSync(generatedWorkDirectory, { recursive: true, mode: 0o700 });
	const clock = { now: () => new Date().toISOString() };
	const ids = new RandomIdGenerator();
	const commands = new CommandService(repository, new DecisionEngine(), ids, clock);
	const profile = createProfile({
		id: "profile_local",
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
		source: "inferred",
	}, clock.now());
	const coreBackend = new FallbackWorkBackend(commands, profile, clock);
	const codexSetup = new CodexSetup<CodexAppServer>({
		locate: () => locateCodex({
			localBinaryPath: app.isPackaged
				? join(process.resourcesPath, "codex", "codex")
				: join(app.getAppPath(), "node_modules", ".bin", "codex"),
		}),
		connect: (command) => CodexAppServer.start(command, app.getVersion()),
		openExternal: (url) => shell.openExternal(url),
	});
	const backend = new IntegratedDesktopBackend({
		core: coreBackend,
		setup: codexSetup,
		executionRepository,
		defaultWorkDirectory: generatedWorkDirectory,
		createRuntime: (publish) => createDesktopExecutionRuntime({
			setup: codexSetup,
			repository: executionRepository,
			work: new CommandWorkExecutionPort(commands),
			ids,
			clock,
			profile,
			readOnlyDirectory: interpreterDirectory,
		}, publish),
		openArtifact: async (path) => { shell.showItemInFolder(path); },
		clock,
	});
	const updatePetState = async <T extends Awaited<ReturnType<typeof backend.submitText>>>(work: Promise<T>): Promise<T> => {
		const snapshot = await work;
		bridge.setState(toPetStatus({
			topDecision: snapshot.decisions[0] ?? null,
			activeExecution: snapshot.executions.at(-1) ?? null,
		}));
		return snapshot;
	};
	const applicationService = new ApplicationService({
		getSnapshot: () => backend.getSnapshot(),
		submitText: (text) => updatePetState(backend.submitText(text)),
		runCommand: (command) => updatePetState(backend.runCommand(command)),
		chooseDirectory: async () => {
			const selection = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
			const paths = selection.canceled ? [] : selection.filePaths;
			backend.setWorkDirectory(paths[0] ?? null);
			return paths;
		},
		openWorkbench: openWorkbenchWindow,
		hideMiniPanel: () => miniPanel?.hide(),
		resetApplicationData: () => runApplicationReset({
			closeBackend: () => backend.stopExecutionRuntime(),
			closeCodex: () => codexSetup.close(),
			clearData: () => clearApplicationData(database),
			relaunch: () => app.relaunch(),
			quit: () => app.quit(),
		}),
	});
	const closeBackendEvents = backend.subscribe((event) => {
		applicationService.publishEvent(event);
		void backend.getSnapshot().then((snapshot) => bridge.setState(toPetStatus({
			topDecision: snapshot.decisions[0] ?? null,
			activeExecution: snapshot.executions.at(-1) ?? null,
		})));
	});
	closeIpc = registerDesktopIpc(ipcMain, applicationService, () =>
		[workbench, miniPanel].filter((window): window is BrowserWindow => window !== null).map((window) => window.webContents));
	createWindows();
	closeShortcuts = registerWindowShortcuts(globalShortcut, {
		openMiniPanel: openMiniPanelNearCursor,
		openWorkbench: openWorkbenchWindow,
	});

	app.on("before-quit", (event) => {
		if (shutdownStarted) return;
		event.preventDefault();
		shutdownStarted = true;
		closeShortcuts?.();
		closeShortcuts = null;
		petProcess.stop();
		closePetEvents?.();
		closePetEvents = null;
		closeIpc?.();
		closeIpc = null;
		closeBackendEvents();
		void Promise.allSettled([bridge.close(), backend.close(), codexSetup.close()]).finally(() => {
			closeDatabase?.();
			closeDatabase = null;
			workbench = null;
			miniPanel = null;
			app.quit();
		});
	});
};

app.on("activate", createWindows);
app.on("window-all-closed", () => app.quit());
void app.whenReady().then(startDesktop).catch((error: unknown) => {
	console.error("启动日桌面宿主启动失败", error);
	app.quit();
});
