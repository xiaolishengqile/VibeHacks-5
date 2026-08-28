export const channels = {
	snapshot: "work:snapshot",
	submitText: "work:submit-text",
	command: "work:command",
	openWorkbench: "window:open-workbench",
	chooseDirectory: "workspace:choose-directory",
	event: "application:event",
} as const;

export type InvokeChannel = typeof channels.snapshot
	| typeof channels.submitText
	| typeof channels.command
	| typeof channels.openWorkbench
	| typeof channels.chooseDirectory;
