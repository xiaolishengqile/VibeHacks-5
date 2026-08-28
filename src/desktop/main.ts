import { app, BrowserWindow, dialog, ipcMain } from "electron";
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

import { createMiniPanelWindow, createWorkbenchWindow } from "./windows.js";

let workbench: BrowserWindow | null = null;
let miniPanel: BrowserWindow | null = null;
let closeIpc: (() => void) | null = null;
let closeDatabase: (() => void) | null = null;

const createWindows = (): void => {
	if (!workbench || workbench.isDestroyed()) workbench = createWorkbenchWindow(BrowserWindow);
	if (!miniPanel || miniPanel.isDestroyed()) miniPanel = createMiniPanelWindow(BrowserWindow);
};

await app.whenReady();
createWindows();

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
const applicationService = new ApplicationService({
	submitText: (text) => backend.submitText(text),
	runCommand: (command) => backend.runCommand(command),
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

app.on("activate", createWindows);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
	closeIpc?.();
	closeIpc = null;
	closeDatabase?.();
	closeDatabase = null;
	workbench = null;
	miniPanel = null;
});
