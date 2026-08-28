import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { join } from "node:path";

import { RandomIdGenerator } from "../shared/ids.js";
import { migrateDatabase, openDatabase } from "../storage/database.js";
import { SqliteWorkRepository } from "../storage/work-repository.js";
import { CommandService } from "../work/command-service.js";
import { DecisionEngine } from "../work/decision-engine.js";
import { createProfile } from "../work/profile.js";
import { ApplicationService } from "./application-service.js";
import { FallbackWorkBackend } from "./core-application.js";
import { registerDesktopIpc } from "./ipc.js";
import { PetBridge } from "./pet-bridge.js";
import { PetProcess } from "./pet-process.js";
import { toPetStatus } from "../renderer/view-models.js";

import {
	createMiniPanelWindow,
	createWorkbenchWindow,
	screenCornerForPoint,
	showMiniPanelNearPet,
} from "./windows.js";

let workbench: BrowserWindow | null = null;
let miniPanel: BrowserWindow | null = null;
let closeIpc: (() => void) | null = null;
let closeDatabase: (() => void) | null = null;
let closePetEvents: (() => void) | null = null;

const createWindows = (): void => {
	if (!workbench || workbench.isDestroyed()) workbench = createWorkbenchWindow(BrowserWindow);
	if (!miniPanel || miniPanel.isDestroyed()) miniPanel = createMiniPanelWindow(BrowserWindow);
};

const startDesktop = async (): Promise<void> => {
	createWindows();
	const bridge = await PetBridge.start();
	const petProcess = new PetProcess({
		packaged: app.isPackaged,
		projectRoot: app.getAppPath(),
		resourcesPath: process.resourcesPath,
	});
	closePetEvents = bridge.onEvent((event) => {
		if (event.type === "quit_requested") return app.quit();
		if (event.type !== "open_panel" || !miniPanel) return;
		const cursor = screen.getCursorScreenPoint();
		const workArea = screen.getDisplayNearestPoint(cursor).workArea;
		showMiniPanelNearPet(miniPanel, workArea, screenCornerForPoint(cursor, workArea));
	});
	petProcess.start({ port: bridge.port, token: bridge.token });

	const database = openDatabase(join(app.getPath("userData"), "startday.sqlite"));
	migrateDatabase(database);
	closeDatabase = () => database.close();
	const repository = new SqliteWorkRepository(database);
	const clock = { now: () => new Date().toISOString() };
	const commands = new CommandService(repository, new DecisionEngine(), new RandomIdGenerator(), clock);
	const profile = createProfile({
		id: "profile_local",
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
		dailyCapacityMinutes: 420,
		bufferPercent: 20,
	}, clock.now());
	const backend = new FallbackWorkBackend(commands, profile, clock);
	const updatePetState = async <T extends Awaited<ReturnType<typeof backend.submitText>>>(work: Promise<T>): Promise<T> => {
		const snapshot = await work;
		bridge.setState(toPetStatus({
			topDecision: snapshot.decisions[0] ?? null,
			activeExecution: snapshot.executions.at(-1) ?? null,
		}));
		return snapshot;
	};
	const applicationService = new ApplicationService({
		submitText: (text) => updatePetState(backend.submitText(text)),
		runCommand: (command) => updatePetState(backend.runCommand(command)),
		chooseDirectory: async () => {
			const selection = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
			return selection.canceled ? [] : selection.filePaths;
		},
		openWorkbench: () => {
			workbench?.show();
			workbench?.focus();
		},
	});
	closeIpc = registerDesktopIpc(ipcMain, applicationService, () =>
		[workbench, miniPanel].filter((window): window is BrowserWindow => window !== null).map((window) => window.webContents));

	app.on("before-quit", () => {
		petProcess.stop();
		closePetEvents?.();
		closePetEvents = null;
		void bridge.close();
		closeIpc?.();
		closeIpc = null;
		closeDatabase?.();
		closeDatabase = null;
		workbench = null;
		miniPanel = null;
	});
};

app.on("activate", createWindows);
app.on("window-all-closed", () => app.quit());
void app.whenReady().then(startDesktop).catch((error: unknown) => {
	console.error("启动日桌面宿主启动失败", error);
	app.quit();
});
