import { mapCodexEvent, type MappedCodexEvent } from "./event-mapper.js";
import type { ApprovalAnswer } from "./app-server-client.js";
import type { JsonRpcId, JsonRpcNotification, JsonRpcServerRequest } from "./protocol.js";
import {
	type PermissionDecision,
	PermissionPolicy,
	type PermissionRequest,
} from "../execution/permission-policy.js";
import type { ExecutionRun } from "../execution/types.js";

export interface ExecutionAgentAppServer {
	startThread(params: Readonly<Record<string, unknown>>): Promise<{ readonly thread: { readonly id: string } }>;
	startTurn(params: Readonly<Record<string, unknown>>): Promise<{ readonly turn: { readonly id: string } }>;
	interruptTurn(threadId: string, turnId: string): Promise<void>;
	answerApproval(requestId: JsonRpcId, decision: ApprovalAnswer): Promise<void>;
	onNotification(listener: (notification: JsonRpcNotification) => void): () => void;
	onServerRequest(listener: (request: JsonRpcServerRequest) => void | Promise<void>): () => void;
}

export type ExecutionAgentEvent =
	| ({ readonly runId: string } & MappedCodexEvent)
	| {
		readonly type: "approvalRequested";
		readonly runId: string;
		readonly requestId: string;
		readonly risk: "low" | "medium";
		readonly message: string;
		readonly sessionEligible: boolean;
	}
	| { readonly type: "approvalDenied" | "approvalResolved"; readonly runId: string; readonly message: string };

export type UserApprovalDecision = "approve" | "approveForSession" | "deny";

interface ActiveTurn {
	readonly run: ExecutionRun;
	readonly threadId: string;
	readonly turnId: string;
}

interface PendingApproval {
	readonly id: JsonRpcId;
	readonly active: ActiveTurn;
	readonly summary: string;
	readonly sessionEligible: boolean;
}

type EventListener = (event: ExecutionAgentEvent) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const activeKey = (threadId: string, turnId: string): string => `${threadId}\u0000${turnId}`;

function notificationIds(notification: JsonRpcNotification): { threadId: string; turnId: string } | null {
	if (!isRecord(notification.params) || typeof notification.params.threadId !== "string") return null;
	if (typeof notification.params.turnId === "string") {
		return { threadId: notification.params.threadId, turnId: notification.params.turnId };
	}
	if (isRecord(notification.params.turn) && typeof notification.params.turn.id === "string") {
		return { threadId: notification.params.threadId, turnId: notification.params.turn.id };
	}
	return null;
}

function commandPermission(params: Record<string, unknown>): PermissionRequest {
	if (typeof params.command !== "string" || /[;&|><\n\r]/.test(params.command)) {
		return { kind: "unknown", value: params };
	}
	const parts = params.command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => part.replace(/^(['"])(.*)\1$/, "$2")) ?? [];
	const executable = parts.shift();
	return executable ? { kind: "command", executable, args: parts } : { kind: "unknown", value: params };
}

function filePermissions(params: Record<string, unknown>): PermissionRequest[] {
	const changes = Array.isArray(params.changes) ? params.changes : [];
	const permissions = changes.flatMap((change): PermissionRequest[] => {
		if (!isRecord(change) || typeof change.path !== "string" || !isRecord(change.kind)) return [];
		if (change.kind.type === "add") return [{ kind: "file", operation: "create", path: change.path }];
		if (change.kind.type === "delete") return [{ kind: "file", operation: "delete", path: change.path }];
		if (change.kind.type === "update" && typeof change.kind.move_path === "string") {
			return [{ kind: "file", operation: "move", path: change.path, destinationPath: change.kind.move_path }];
		}
		return change.kind.type === "update"
			? [{ kind: "file", operation: "overwrite", path: change.path }]
			: [];
	});
	if (permissions.length === 0 && typeof params.grantRoot === "string") {
		permissions.push({ kind: "file", operation: "overwrite", path: params.grantRoot });
	}
	if (permissions.length === 0) {
		permissions.push({
			kind: "workspacePatch",
			reason: typeof params.reason === "string" ? params.reason : "修改已授权工作目录内的文件",
		});
	}
	return permissions;
}

function combinedDecision(decisions: readonly PermissionDecision[]): PermissionDecision {
	const denied = decisions.find((decision) => decision.kind === "deny");
	if (denied?.kind === "deny") return denied;
	const confirmations = decisions.filter((decision) => decision.kind === "confirm");
	if (confirmations.length > 0) {
		return {
			kind: "confirm",
			risk: confirmations.some((decision) => decision.kind === "confirm" && decision.risk === "medium") ? "medium" : "low",
			summary: confirmations.map((decision) => decision.kind === "confirm" ? decision.summary : "").join("；"),
			sessionEligible: confirmations.every((decision) => decision.kind === "confirm" && decision.sessionEligible),
		};
	}
	return { kind: "allow", summary: decisions.map((decision) => decision.kind === "allow" ? decision.summary : "").join("；") };
}

export class CodexExecutionAgent {
	readonly #server: ExecutionAgentAppServer;
	readonly #policy: PermissionPolicy;
	readonly #listeners = new Set<EventListener>();
	readonly #active = new Map<string, ActiveTurn>();
	readonly #pending = new Map<string, PendingApproval>();
	readonly #unsubscribeNotification: () => void;
	readonly #unsubscribeRequest: () => void;

	constructor(server: ExecutionAgentAppServer, policy: PermissionPolicy) {
		this.#server = server;
		this.#policy = policy;
		this.#unsubscribeNotification = server.onNotification((notification) => this.#notification(notification));
		this.#unsubscribeRequest = server.onServerRequest((request) => this.#serverRequest(request));
	}

	onEvent(listener: EventListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	async plan(run: ExecutionRun): Promise<{ threadId: string; turnId: string }> {
		const cwd = this.#primaryWorkspace(run);
		const thread = await this.#server.startThread({
			model: run.model, cwd, approvalPolicy: "never", sandbox: "read-only", ephemeral: false,
		});
		const turn = await this.#server.startTurn({
			threadId: thread.thread.id,
			input: [{
				type: "text",
				text: `请为以下目标生成中文执行计划，只规划不修改文件：${run.goal}\n声明需要读取和写入的文件、工具、网络资源及风险。`,
				text_elements: [],
			}],
			effort: "medium",
			sandboxPolicy: { type: "readOnly", networkAccess: false },
		});
		return this.#activate(run, thread.thread.id, turn.turn.id);
	}

	async execute(run: ExecutionRun): Promise<{ threadId: string; turnId: string }> {
		const cwd = this.#primaryWorkspace(run);
		const threadId = run.threadId ?? (await this.#server.startThread({
			model: run.model, cwd, approvalPolicy: "unlessTrusted", sandbox: "workspace-write", ephemeral: false,
		})).thread.id;
		const turn = await this.#server.startTurn({
			threadId,
			input: [{ type: "text", text: run.goal, text_elements: [] }],
			cwd,
			approvalPolicy: "unlessTrusted",
			sandboxPolicy: {
				type: "workspaceWrite",
				writableRoots: [...run.workspaceRoots],
				networkAccess: run.networkEnabled,
				excludeTmpdirEnvVar: true,
				excludeSlashTmp: true,
			},
			model: run.model,
			effort: "medium",
		});
		return this.#activate(run, threadId, turn.turn.id);
	}

	async approve(requestId: string, decision: UserApprovalDecision): Promise<void> {
		const pending = this.#pending.get(requestId);
		if (!pending) throw new Error("审批请求不存在或已经处理");
		if (decision === "approveForSession" && !pending.sessionEligible) {
			throw new Error("该操作不能在本次执行中持续授权");
		}
		const answer: ApprovalAnswer = decision === "deny"
			? "decline"
			: decision === "approveForSession" ? "acceptForSession" : "accept";
		await this.#server.answerApproval(pending.id, answer);
		this.#pending.delete(requestId);
		this.#emit({
			type: "approvalResolved",
			runId: pending.active.run.id,
			message: decision === "deny" ? `已拒绝：${pending.summary}` : `已批准：${pending.summary}`,
		});
	}

	async interrupt(run: ExecutionRun): Promise<void> {
		if (!run.threadId || !run.turnId) throw new Error("执行任务缺少可中断的线程或回合");
		await this.#server.interruptTurn(run.threadId, run.turnId);
	}

	close(): void {
		this.#unsubscribeNotification();
		this.#unsubscribeRequest();
		this.#listeners.clear();
		this.#active.clear();
		this.#pending.clear();
	}

	#activate(run: ExecutionRun, threadId: string, turnId: string): { threadId: string; turnId: string } {
		this.#active.set(activeKey(threadId, turnId), { run, threadId, turnId });
		return { threadId, turnId };
	}

	#notification(notification: JsonRpcNotification): void {
		const ids = notificationIds(notification);
		if (!ids) return;
		const active = this.#active.get(activeKey(ids.threadId, ids.turnId));
		const mapped = mapCodexEvent(notification);
		if (active && mapped) {
			this.#emit({ ...mapped, runId: active.run.id });
			if (mapped.type === "turnCompleted" || mapped.type === "turnFailed" || mapped.type === "turnInterrupted") {
				this.#active.delete(activeKey(ids.threadId, ids.turnId));
			}
		}
	}

	async #serverRequest(request: JsonRpcServerRequest): Promise<void> {
		const params = isRecord(request.params) ? request.params : {};
		const threadId = typeof params.threadId === "string" ? params.threadId : "";
		const turnId = typeof params.turnId === "string" ? params.turnId : "";
		const active = this.#active.get(activeKey(threadId, turnId));
		if (!active) return this.#server.answerApproval(request.id, "decline");
		let permissionRequests: PermissionRequest[];
		if (request.method === "item/commandExecution/requestApproval") {
			permissionRequests = [commandPermission(params)];
		} else if (request.method === "item/fileChange/requestApproval") {
			permissionRequests = filePermissions(params);
		} else {
			permissionRequests = [{ kind: "unknown", value: params }];
		}
		const decision = combinedDecision(permissionRequests.map((entry) => this.#policy.evaluate(entry, active.run)));
		await this.#resolvePolicyDecision(request.id, active, decision);
	}

	async #resolvePolicyDecision(id: JsonRpcId, active: ActiveTurn, decision: PermissionDecision): Promise<void> {
		if (decision.kind === "deny") {
			await this.#server.answerApproval(id, "decline");
			this.#emit({ type: "approvalDenied", runId: active.run.id, message: decision.reason });
			return;
		}
		if (decision.kind === "allow") {
			await this.#server.answerApproval(id, "accept");
			this.#emit({ type: "approvalResolved", runId: active.run.id, message: decision.summary });
			return;
		}
		const requestId = String(id);
		this.#pending.set(requestId, {
			id, active, summary: decision.summary, sessionEligible: decision.sessionEligible,
		});
		this.#emit({
			type: "approvalRequested",
			runId: active.run.id,
			requestId,
			risk: decision.risk,
			message: decision.summary,
			sessionEligible: decision.sessionEligible,
		});
	}

	#primaryWorkspace(run: ExecutionRun): string {
		const workspace = run.workspaceRoots[0];
		if (!workspace) throw new Error("执行任务没有用户选择的工作目录");
		return workspace;
	}

	#emit(event: ExecutionAgentEvent): void {
		for (const listener of this.#listeners) listener(event);
	}
}
