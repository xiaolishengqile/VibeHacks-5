import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SecureWindowOptions = BrowserWindowConstructorOptions & {
	readonly webPreferences: NonNullable<BrowserWindowConstructorOptions["webPreferences"]>;
};

export interface BrowserWindowConstructor {
	new(options: BrowserWindowConstructorOptions): BrowserWindow;
}

export type ScreenCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

interface RectangleLike {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

interface MiniPanelLike {
	getBounds(): RectangleLike;
	setPosition(x: number, y: number): void;
	show(): void;
	focus(): void;
}

const desktopDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(desktopDirectory, "preload.cjs");
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
		backgroundColor: "#f5f5f7",
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
		backgroundColor: "#f5f5f7",
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

export function screenCornerForPoint(point: { readonly x: number; readonly y: number }, workArea: RectangleLike): ScreenCorner {
	const horizontal = point.x < workArea.x + workArea.width / 2 ? "Left" : "Right";
	const vertical = point.y < workArea.y + workArea.height / 2 ? "top" : "bottom";
	return `${vertical}${horizontal}` as ScreenCorner;
}

export function showMiniPanelNearPet(
	window: MiniPanelLike,
	workArea: RectangleLike,
	corner: ScreenCorner = "bottomRight",
): void {
	const panel = window.getBounds();
	const pet = { width: 264, height: 231 };
	const gap = 12;
	const right = workArea.x + workArea.width;
	const bottom = workArea.y + workArea.height;
	let x = corner.endsWith("Right") ? right - panel.width - pet.width - gap : workArea.x + pet.width + gap;
	let y = corner.startsWith("bottom") ? bottom - panel.height : workArea.y;
	x = Math.max(workArea.x, Math.min(x, right - panel.width));
	y = Math.max(workArea.y, Math.min(y, bottom - panel.height));
	window.setPosition(Math.round(x), Math.round(y));
	window.show();
	window.focus();
}
