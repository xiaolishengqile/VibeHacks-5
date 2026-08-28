import { contextBridge, ipcRenderer } from "electron";

import type { ApplicationSnapshot, UiCommand, VisibleApplicationEvent } from "./application-service.js";
import { channels } from "./channels.js";
import type { Result } from "../shared/result.js";

export interface DesktopApi {
	getSnapshot(): Promise<Result<ApplicationSnapshot, string>>;
	submitWorkText(text: string): Promise<Result<ApplicationSnapshot, string>>;
	runCommand(command: UiCommand): Promise<Result<ApplicationSnapshot, string>>;
	openWorkbench(): Promise<Result<null, string>>;
	chooseWorkDirectory(): Promise<Result<string | null, string>>;
	subscribe(listener: (event: VisibleApplicationEvent) => void): () => void;
}

const desktopApi: DesktopApi = {
	getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
	submitWorkText: (text) => ipcRenderer.invoke(channels.submitText, { text }),
	runCommand: (command) => ipcRenderer.invoke(channels.command, command),
	openWorkbench: () => ipcRenderer.invoke(channels.openWorkbench),
	chooseWorkDirectory: () => ipcRenderer.invoke(channels.chooseDirectory),
	subscribe: (listener) => {
		const wrapped = (_event: Electron.IpcRendererEvent, value: VisibleApplicationEvent) => listener(value);
		ipcRenderer.on(channels.event, wrapped);
		return () => ipcRenderer.removeListener(channels.event, wrapped);
	},
};

contextBridge.exposeInMainWorld("startDay", Object.freeze(desktopApi));
