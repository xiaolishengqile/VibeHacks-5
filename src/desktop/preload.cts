import type { DesktopApi } from "./preload.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

// 沙箱预加载必须是独立的通用模块，不能在运行时导入应用的模块图。
const channels = Object.freeze({
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	hideMiniPanel: "window:hide-mini-panel",
	resetApplicationData: "application:reset-data",
	chooseDirectory: "workspace:choose-directory",
	event: "application:event",
	changed: "application:changed",
});

const desktopApi = {
	getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
	submitWorkText: (text) => ipcRenderer.invoke(channels.submitText, { text }),
	runCommand: (command) => ipcRenderer.invoke(channels.command, command),
	openWorkbench: () => ipcRenderer.invoke(channels.openWorkbench),
	hideMiniPanel: () => ipcRenderer.invoke(channels.hideMiniPanel),
	resetApplicationData: () => ipcRenderer.invoke(channels.resetApplicationData),
	chooseWorkDirectory: () => ipcRenderer.invoke(channels.chooseDirectory),
	subscribe: (listener) => {
		const wrapped = () => listener();
		ipcRenderer.on(channels.changed, wrapped);
		return () => ipcRenderer.removeListener(channels.changed, wrapped);
	},
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("startDay", Object.freeze(desktopApi));
