import type { CommandService, CommandState } from "../work/command-service.js";
import type { Clock } from "../work/repositories.js";
import type { WorkProfile } from "../work/types.js";
import {
	emptyApplicationSnapshot,
	type ApplicationSnapshot,
	type UiCommand,
} from "./application-service.js";

export class FallbackWorkBackend {
	readonly #commands: CommandService;
	readonly #profile: WorkProfile;
	readonly #clock: Clock;
	#snapshot = emptyApplicationSnapshot();

	constructor(commands: CommandService, profile: WorkProfile, clock: Clock) {
		this.#commands = commands;
		this.#profile = profile;
		this.#clock = clock;
	}

	async submitText(text: string): Promise<ApplicationSnapshot> {
		const now = this.#clock.now();
		const deadline = new Date(Date.parse(now) + 7 * 24 * 60 * 60_000).toISOString();
		const title = text.split("\n")[0]!.trim().slice(0, 80);
		const result = await this.#commands.createFromDraft({
			profile: this.#profile,
			draft: {
				title,
				deadline,
				milestones: [],
				nodes: [{
					title,
					owner: "self",
					workMinutes: 60,
					waitMinutes: 0,
					dependencyIndexes: [],
				}],
				assumptions: ["智能理解服务不可用，已建立可手动调整的本地计划"],
			},
		});
		return this.#capture(result);
	}

	async runCommand(command: UiCommand): Promise<ApplicationSnapshot> {
		switch (command.name) {
			case "changeDeadline":
				return this.#capture(await this.#commands.changeDeadline(command));
			case "changeMilestone":
				return this.#capture(await this.#commands.changeMilestone(command));
			case "changeOwner":
				return this.#capture(await this.#commands.changeOwner(command));
			case "prepareStop": {
				const pendingStop = await this.#commands.prepareStop(command);
				this.#snapshot = { ...this.#snapshot, pendingStop };
				return this.#snapshot;
			}
			case "confirmStop":
				return this.#capture(await this.#commands.confirmStop(command));
			case "recordDuration":
				return this.#capture(await this.#commands.recordActualDuration(command));
			case "acceptArtifact":
				return this.#capture(await this.#commands.acceptArtifact(command));
			default:
				throw new Error("该命令不属于基础工作计划");
		}
	}

	async getSnapshot(): Promise<ApplicationSnapshot> {
		const state = this.#snapshot.goal
			? await this.#commands.read(this.#snapshot.goal.id)
			: await this.#commands.readLatest();
		if (state) this.#capture(state, false);
		return structuredClone(this.#snapshot);
	}

	async createFromDraft(draft: Parameters<CommandService["createFromDraft"]>[0]["draft"]): Promise<ApplicationSnapshot> {
		return this.#capture(await this.#commands.createFromDraft({ profile: this.#profile, draft }));
	}

	#capture(result: CommandState, clearPendingStop = true): ApplicationSnapshot {
		this.#snapshot = {
			...this.#snapshot,
			goal: result.aggregate.graph.goal,
			nodes: result.aggregate.graph.nodes,
			decisions: result.decisions,
			changes: result.aggregate.changes,
			pendingStop: clearPendingStop ? null : this.#snapshot.pendingStop,
		};
		return this.#snapshot;
	}
}
