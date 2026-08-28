export const channels = {
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	hideMiniPanel: "window:hide-mini-panel",
	chooseDirectory: "workspace:choose-directory",
	event: "application:event",
	changed: "application:changed",
} as const;

export type InvokeChannel = typeof channels.snapshot
	| typeof channels.submitText
	| typeof channels.command
	| typeof channels.openWorkbench
	| typeof channels.hideMiniPanel
	| typeof channels.chooseDirectory;
