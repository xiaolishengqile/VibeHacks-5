import type { JsonRpcNotification } from "./protocol.js";
import { workDraftOutputSchema } from "./work-draft-schema.js";
import type { WorkDraftInterpretation, WorkInterpreter } from "../work/interpreter.js";
import type { WorkProfile } from "../work/types.js";
import { validateWorkDraft } from "../work/types.js";

export interface WorkInterpretationAppServer {
	chooseModel(): Promise<string | null>;
	startThread(params: Readonly<Record<string, unknown>>): Promise<{ readonly thread: { readonly id: string } }>;
	startTurn(params: Readonly<Record<string, unknown>>): Promise<{ readonly turn: { readonly id: string } }>;
	onNotification(listener: (notification: JsonRpcNotification) => void): () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function finalAgentText(notification: JsonRpcNotification, threadId: string, turnId: string): string | null {
	if (notification.method !== "item/completed" || !isRecord(notification.params)) return null;
	if (notification.params.threadId !== threadId || notification.params.turnId !== turnId) return null;
	const item = notification.params.item;
	return isRecord(item) && item.type === "agentMessage" && typeof item.text === "string" ? item.text : null;
}

function turnCompletion(notification: JsonRpcNotification, threadId: string, turnId: string): string | null {
	if (notification.method !== "turn/completed" || !isRecord(notification.params)) return null;
	if (notification.params.threadId !== threadId || !isRecord(notification.params.turn)) return null;
	return notification.params.turn.id === turnId && typeof notification.params.turn.status === "string"
		? notification.params.turn.status
		: null;
}

function profileSummary(profile: WorkProfile): Record<string, unknown> {
	return {
		timezone: profile.timezone.value,
		workdayStart: profile.workdayStart.value,
		workdayEnd: profile.workdayEnd.value,
		dailyCapacityMinutes: profile.dailyCapacityMinutes.value,
		bufferPercent: profile.bufferPercent.value,
		recentDurationObservations: profile.durationObservations.slice(-5),
		recentWaitingObservations: profile.waitingObservations.slice(-5),
	};
}

function interpretationPrompt(text: string, profile: WorkProfile, retry: boolean, existingPlanContext?: string): string {
	return [
		"你是启动日的工作理解器。只提取和估算信息，不执行任务。",
		"必须输出符合给定结构的纯数据。不得计算最晚开始时间，不得修改任何工作记录。",
		`当前时间：${new Date().toISOString()}。必须先根据当前时间解析今天、本周、下周等相对日期，再核对用户要求的截止日期。`,
		"工作节点只能安排在周一至周五的个人工作时段，周六、周日不安排工作；周末截止可以保留，但实际工作必须提前到工作日完成。",
		"每个节点必须提供任务说明、可执行步骤、具体交付物、可检查完成标准、针对性助理建议，以及至少一个包含风险、触发条件和兜底行动的预案。",
		"演示文稿类工作必须先写完整叙事文稿，缺失数据先占位，再制作初稿、安排预审并预留打磨时间；不得一开始就做页面美化。",
		"跨人协作要明确反馈截止和二次跟进时间；方案类工作先交最小可审版本，并为被驳回后的修改预留工作日。",
		"负责人未知时写“我”。没有明确截止时间时 deadline 写 null，并且只提出一个 blockingQuestion。",
		"依赖使用从零开始的节点下标；工作量和等待时间使用整数分钟。所有时间使用带时区的标准时间。",
		"如果用户要求重新安排、插入突发事件或调整已有计划，必须结合现有安排输出一份完整替代草稿，不得遗漏仍需保留的未完成事项；仍需保留且用户未明确要求修改的节点，必须原样保留已有有效详情。",
		"现有未完成节点必须回传其 sourceNodeId；新建节点不得包含 sourceNodeId。用户明确提供的职业背景必须原样保留在 assumptions；信息不足时不得猜测职业。",
		retry ? "上一次结果格式无效。请修正结构并重新完整输出，不要解释。" : "不要添加解释性文字。",
		`个人工作背景：${JSON.stringify(profileSummary(profile))}`,
		existingPlanContext?.trim() ? `现有安排：${existingPlanContext.trim()}` : "现有安排：无",
		`用户描述：${text.trim()}`,
	].join("\n");
}

function parseInterpretation(text: string): WorkDraftInterpretation | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(value) || typeof value.confidence !== "number"
		|| value.confidence < 0 || value.confidence > 1) return null;
	const question = typeof value.blockingQuestion === "string" ? value.blockingQuestion.trim() : "";
	if (value.deadline === null || question) {
		return {
			status: "needsInput",
			draft: null,
			confidence: value.confidence,
			questions: [question || "这项工作最晚需要在什么时间完成？"],
		};
	}
	const validated = validateWorkDraft(value);
	if (!validated.ok) return null;
	return { status: "ready", draft: validated.value, confidence: value.confidence, questions: [] };
}

export class CodexWorkInterpreter implements WorkInterpreter {
	readonly #server: WorkInterpretationAppServer;
	readonly #readOnlyDirectory: string;
	readonly #turnTimeoutMs: number;

	constructor(server: WorkInterpretationAppServer, readOnlyDirectory: string, turnTimeoutMs = 30_000) {
		this.#server = server;
		this.#readOnlyDirectory = readOnlyDirectory;
		this.#turnTimeoutMs = turnTimeoutMs;
	}

	async interpret(text: string, profileContext: WorkProfile, existingPlanContext?: string): Promise<WorkDraftInterpretation> {
		if (!text.trim()) return this.#failure("工作描述不能为空");
		const model = await this.#server.chooseModel();
		if (!model) return this.#failure("执行代理没有可用模型，请先检查账号和模型配置");
		const started = await this.#server.startThread({
			model,
			cwd: this.#readOnlyDirectory,
			approvalPolicy: "never",
			sandbox: "read-only",
			ephemeral: true,
		});
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				const output = await this.#runTurn(
					started.thread.id,
					interpretationPrompt(text, profileContext, attempt > 0, existingPlanContext),
				);
				const parsed = parseInterpretation(output);
				if (parsed) return parsed;
			} catch (error) {
				if (attempt === 1) return this.#failure(error instanceof Error ? error.message : "工作理解执行失败");
			}
		}
		return this.#failure("执行代理连续两次无法生成有效的工作草稿");
	}

	async #runTurn(threadId: string, prompt: string): Promise<string> {
		let turnId: string | null = null;
		let agentText = "";
		const buffered: JsonRpcNotification[] = [];
		let settle!: (value: string) => void;
		let fail!: (error: Error) => void;
		const completed = new Promise<string>((resolve, reject) => { settle = resolve; fail = reject; });
		const timer = setTimeout(() => fail(new Error("工作理解等待执行代理超时")), this.#turnTimeoutMs);
		const processNotification = (notification: JsonRpcNotification): void => {
			if (!turnId) return;
			agentText = finalAgentText(notification, threadId, turnId) ?? agentText;
			const status = turnCompletion(notification, threadId, turnId);
			if (!status) return;
			if (status === "completed" && agentText) settle(agentText);
			else fail(new Error(status === "interrupted" ? "工作理解已中断" : "执行代理未返回工作草稿"));
		};
		const unsubscribe = this.#server.onNotification((notification) => {
			buffered.push(notification);
			processNotification(notification);
		});
		try {
			const started = await this.#server.startTurn({
				threadId,
				input: [{ type: "text", text: prompt, text_elements: [] }],
				effort: "low",
				sandboxPolicy: { type: "readOnly", networkAccess: false },
				outputSchema: workDraftOutputSchema,
			});
			turnId = started.turn.id;
			for (const notification of buffered) processNotification(notification);
			return await completed;
		} finally {
			clearTimeout(timer);
			unsubscribe();
		}
	}

	#failure(error: string): WorkDraftInterpretation {
		return { status: "failed", draft: null, confidence: 0, questions: [], error };
	}
}
