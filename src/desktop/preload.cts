import type { DesktopApi, MiniPanelMode } from "./preload.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

// 沙箱预加载必须是独立的通用模块，不能在运行时导入应用的模块图。
const channels = Object.freeze({
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	addTodo: "work:add-todo",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	hideMiniPanel: "window:hide-mini-panel",
	focusInput: "window:focus-input",
	miniMode: "window:mini-mode",
	resetApplicationData: "application:reset-data",
	chooseDirectory: "workspace:choose-directory",
	recognizeVoice: "voice:recognize",
	event: "application:event",
	changed: "application:changed",
});

const isMiniPanelMode = (value: unknown): value is MiniPanelMode => value === "today" || value === "input";

const desktopApi = {
	getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
	submitWorkText: (text) => ipcRenderer.invoke(channels.submitText, { text }),
	addManualTodo: (todo) => ipcRenderer.invoke(channels.addTodo, todo),
	runCommand: (command) => ipcRenderer.invoke(channels.command, command),
	openWorkbench: () => ipcRenderer.invoke(channels.openWorkbench),
	hideMiniPanel: () => ipcRenderer.invoke(channels.hideMiniPanel),
	onFocusInput: (listener) => {
		const wrapped = () => listener();
		ipcRenderer.on(channels.focusInput, wrapped);
		return () => ipcRenderer.removeListener(channels.focusInput, wrapped);
	},
	onMiniPanelMode: (listener) => {
		const wrapped = (_event: unknown, mode: unknown) => {
			if (isMiniPanelMode(mode)) listener(mode);
		};
		ipcRenderer.on(channels.miniMode, wrapped);
		return () => ipcRenderer.removeListener(channels.miniMode, wrapped);
	},
	resetApplicationData: () => ipcRenderer.invoke(channels.resetApplicationData),
	chooseWorkDirectory: () => ipcRenderer.invoke(channels.chooseDirectory),
	recognizeVoice: (audio) => ipcRenderer.invoke(channels.recognizeVoice, { audio }),
	subscribe: (listener) => {
		const wrapped = () => listener();
		ipcRenderer.on(channels.changed, wrapped);
		return () => ipcRenderer.removeListener(channels.changed, wrapped);
	},
} satisfies DesktopApi;

contextBridge.exposeInMainWorld("startDay", Object.freeze(desktopApi));
