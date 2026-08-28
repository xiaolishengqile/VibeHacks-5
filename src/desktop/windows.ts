import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SecureWindowOptions = BrowserWindowConstructorOptions & {
	readonly webPreferences: NonNullable<BrowserWindowConstructorOptions["webPreferences"]>;
};

export interface BrowserWindowConstructor {
	new(options: BrowserWindowConstructorOptions): BrowserWindow;
}

const desktopDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(desktopDirectory, "preload.js");
const rendererDirectory = join(desktopDirectory, "../renderer");

const secureWebPreferences = () => ({
	preload: preloadPath,
	nodeIntegration: false,
	contextIsolation: true,
	sandbox: true,
});

export function workbenchWindowOptions(): SecureWindowOptions {
	return {
		width: 1180,
		height: 760,
		minWidth: 820,
		minHeight: 560,
		show: false,
		backgroundColor: "#111713",
		title: "启动日工作台",
		webPreferences: secureWebPreferences(),
	};
}

export function miniPanelWindowOptions(): SecureWindowOptions {
	return {
		width: 420,
		height: 560,
		show: false,
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		backgroundColor: "#101a14",
		webPreferences: secureWebPreferences(),
	};
}

export function createWorkbenchWindow(Window: BrowserWindowConstructor): BrowserWindow {
	const window = new Window(workbenchWindowOptions());
	void window.loadFile(join(rendererDirectory, "index.html"));
	return window;
}

export function createMiniPanelWindow(Window: BrowserWindowConstructor): BrowserWindow {
	const window = new Window(miniPanelWindowOptions());
	void window.loadFile(join(rendererDirectory, "mini.html"));
	return window;
}
