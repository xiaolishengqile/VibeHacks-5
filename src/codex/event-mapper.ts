import { basename } from "node:path";

import { redactSecrets } from "./jsonrpc-transport.js";
import type { JsonRpcNotification } from "./protocol.js";

export type MappedCodexEvent =
	| { readonly type: "plan" | "progress" | "tool"; readonly message: string }
	| { readonly type: "artifact"; readonly message: string; readonly paths: readonly string[] }
	| { readonly type: "turnCompleted" | "turnFailed" | "turnInterrupted"; readonly message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const safeText = (value: string, limit = 2_000): string => redactSecrets(value).slice(0, limit);

function mapTurn(params: Record<string, unknown>): MappedCodexEvent | null {
	if (!isRecord(params.turn) || typeof params.turn.status !== "string") return null;
	if (params.turn.status === "completed") {
		return { type: "turnCompleted", message: "执行代理已完成本回合" };
	}
	if (params.turn.status === "interrupted") {
		return { type: "turnInterrupted", message: "执行已被中断" };
	}
	if (params.turn.status === "failed") {
		const error = params.turn.error;
		return {
			type: "turnFailed",
			message: isRecord(error) && typeof error.message === "string"
				? safeText(error.message)
				: "执行代理本回合失败",
		};
	}
	return null;
}

function mapCompletedItem(item: Record<string, unknown>): MappedCodexEvent | null {
	if (item.type === "agentMessage" && typeof item.text === "string") {
		return { type: "progress", message: safeText(item.text, 4_000) };
	}
	if (item.type === "plan" && typeof item.text === "string") {
		return { type: "plan", message: safeText(item.text, 4_000) };
	}
	if (item.type === "commandExecution" && typeof item.command === "string") {
		const label = item.status === "completed" ? "命令完成" : item.status === "declined" ? "命令已拒绝" : "命令失败";
		const output = typeof item.aggregatedOutput === "string" && item.aggregatedOutput.trim()
			? `\n${safeText(item.aggregatedOutput.trim())}`
			: "";
		return { type: "tool", message: `${label}：${safeText(item.command, 500)}${output}` };
	}
	if (item.type === "fileChange" && Array.isArray(item.changes)) {
		const paths = item.changes.flatMap((change): string[] =>
			isRecord(change) && typeof change.path === "string" ? [change.path] : []);
		if (paths.length === 0) return null;
		return {
			type: "artifact",
			message: `文件变更：${paths.map((path) => basename(path)).join("、")}`,
			paths,
		};
	}
	if (item.type === "webSearch" && typeof item.query === "string") {
		return { type: "tool", message: `网页调研：${safeText(item.query, 500)}` };
	}
	return null;
}

export function mapCodexEvent(notification: JsonRpcNotification): MappedCodexEvent | null {
	if (!isRecord(notification.params)) return null;
	if (notification.method === "turn/completed") return mapTurn(notification.params);
	if (notification.method === "item/plan/delta" && typeof notification.params.delta === "string") {
		return { type: "plan", message: safeText(notification.params.delta, 4_000) };
	}
	if (notification.method === "item/commandExecution/outputDelta"
		&& typeof notification.params.delta === "string") {
		return { type: "tool", message: safeText(notification.params.delta) };
	}
	if (notification.method === "item/completed" && isRecord(notification.params.item)) {
		return mapCompletedItem(notification.params.item);
	}
	return null;
}
