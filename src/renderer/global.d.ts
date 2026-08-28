import type { DesktopApi } from "../desktop/preload.js";

declare global {
	interface Window {
		readonly startDay: DesktopApi;
	}
}

export {};
