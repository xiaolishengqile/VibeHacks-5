export const channels = {
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	hideMiniPanel: "window:hide-mini-panel",
	focusInput: "window:focus-input",
	miniMode: "window:mini-mode",
	resetApplicationData: "application:reset-data",
	chooseDirectory: "workspace:choose-directory",
	event: "application:event",
	changed: "application:changed",
} as const;

export type InvokeChannel = typeof channels.snapshot
	| typeof channels.submitText
	| typeof channels.command
	| typeof channels.openWorkbench
	| typeof channels.hideMiniPanel
	| typeof channels.resetApplicationData
	| typeof channels.chooseDirectory;
