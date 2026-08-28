import type { DesktopApi } from "./preload.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

// 沙箱预加载必须是独立的通用模块，不能在运行时导入应用的模块图。
const channels = Object.freeze({
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	chooseDirectory: "workspace:choose-directory",
	event: "application:event",
});

const desktopApi = {
	getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
	submitWorkText: (text) => ipcRenderer.invoke(channels.submitText, { text }),
	runCommand: (command) => ipcRenderer.invoke(channels.command, command),
	openWorkbench: () => ipcRenderer.invoke(channels.openWorkbench),
	chooseWorkDirectory: () => ipcRenderer.invoke(channels.chooseDirectory),
	subscribe: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) => listener(value);
		ipcRenderer.on(channels.event, wrapped);
		return () => ipcRenderer.removeListener(channels.event, wrapped);
	},
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("startDay", Object.freeze(desktopApi));
