import { app, BrowserWindow } from "electron";

import { createMiniPanelWindow, createWorkbenchWindow } from "./windows.js";

let workbench: BrowserWindow | null = null;
let miniPanel: BrowserWindow | null = null;

const createWindows = (): void => {
	if (!workbench || workbench.isDestroyed()) workbench = createWorkbenchWindow(BrowserWindow);
	if (!miniPanel || miniPanel.isDestroyed()) miniPanel = createMiniPanelWindow(BrowserWindow);
};

await app.whenReady();
createWindows();

app.on("activate", createWindows);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
	workbench = null;
	miniPanel = null;
});
