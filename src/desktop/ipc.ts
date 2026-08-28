import type { IpcMain, WebContents } from "electron";

import { err, ok, type Result } from "../shared/result.js";
import { type ApplicationService, type UiCommand } from "./application-service.js";
import { channels, type InvokeChannel } from "./channels.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const requiredText = (record: Record<string, unknown>, key: string): string | null => {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
};

export function parseUiCommand(input: unknown): Result<UiCommand, string> {
	if (!isRecord(input) || typeof input.name !== "string") return err("不支持的工作命令");
	const goalId = requiredText(input, "goalId");
	switch (input.name) {
		case "changeDeadline": {
			const deadline = requiredText(input, "deadline");
			return goalId && deadline ? ok({ name: input.name, goalId, deadline }) : err("工作命令参数无效");
		}
		case "changeMilestone": {
			const milestoneId = requiredText(input, "milestoneId");
			const at = requiredText(input, "at");
			return goalId && milestoneId && at ? ok({ name: input.name, goalId, milestoneId, at }) : err("工作命令参数无效");
		}
		case "changeOwner": {
			const nodeId = requiredText(input, "nodeId");
			const owner = requiredText(input, "owner");
			return goalId && nodeId && owner ? ok({ name: input.name, goalId, nodeId, owner }) : err("工作命令参数无效");
		}
		case "prepareStop": {
			const nodeId = requiredText(input, "nodeId");
			return goalId && nodeId ? ok({ name: input.name, goalId, nodeId }) : err("工作命令参数无效");
		}
		case "confirmStop": {
			const token = requiredText(input, "token");
			return goalId && token ? ok({ name: input.name, goalId, token }) : err("工作命令参数无效");
		}
		case "recordDuration": {
			const nodeId = requiredText(input, "nodeId");
			const actualMinutes = input.actualMinutes;
			return goalId && nodeId && Number.isInteger(actualMinutes) && Number(actualMinutes) > 0
				? ok({ name: input.name, goalId, nodeId, actualMinutes: Number(actualMinutes) })
				: err("工作命令参数无效");
		}
		case "acceptArtifact": {
			const nodeId = requiredText(input, "nodeId");
			const artifactId = requiredText(input, "artifactId");
			return goalId && nodeId && artifactId
				? ok({ name: input.name, goalId, nodeId, artifactId })
				: err("工作命令参数无效");
		}
		default:
			return err("不支持的工作命令");
	}
}

export type InvokeResult = Result<unknown, string>;

export function createInvokeHandler(service: ApplicationService) {
	return async (channel: string, payload?: unknown): Promise<InvokeResult> => {
		try {
			switch (channel as InvokeChannel) {
				case channels.snapshot:
					return ok(await service.getSnapshot());
				case channels.submitText: {
					const text = isRecord(payload) ? requiredText(payload, "text") : null;
					if (!text) return err("工作描述不能为空");
					return ok(await service.submitWorkText(text));
				}
				case channels.command: {
					const command = parseUiCommand(payload);
					return command.ok ? ok(await service.runCommand(command.value)) : command;
				}
				case channels.openWorkbench:
					service.openWorkbench();
					return ok(null);
				case channels.chooseDirectory:
					return ok(await service.chooseWorkDirectory());
				default:
					return err("不支持的桌面请求");
			}
		} catch (error) {
			return err(error instanceof Error ? error.message : "桌面请求失败");
		}
	};
}

export function registerDesktopIpc(
	ipcMain: IpcMain,
	service: ApplicationService,
	webContents: () => readonly WebContents[],
): () => void {
	const invoke = createInvokeHandler(service);
	const invokeChannels: readonly InvokeChannel[] = [
		channels.snapshot,
		channels.submitText,
		channels.command,
		channels.openWorkbench,
		channels.chooseDirectory,
	];
	for (const channel of invokeChannels) {
		ipcMain.handle(channel, (_event, payload) => invoke(channel, payload));
	}
	const unsubscribe = service.subscribe((event) => {
		for (const target of webContents()) {
			if (!target.isDestroyed()) target.send(channels.event, event);
		}
	});
	return () => {
		unsubscribe();
		for (const channel of invokeChannels) ipcMain.removeHandler(channel);
	};
}
