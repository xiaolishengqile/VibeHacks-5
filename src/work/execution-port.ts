import type { WorkExecutionPort } from "../execution/orchestrator.js";
import type { CommandService } from "./command-service.js";

export class CommandWorkExecutionPort implements WorkExecutionPort {
	constructor(readonly commands: CommandService) {}

	async start(workGoalId: string, workNodeId: string): Promise<void> {
		await this.commands.startExecution({ goalId: workGoalId, nodeId: workNodeId });
	}

	async review(workGoalId: string, workNodeId: string): Promise<void> {
		await this.commands.submitForReview({ goalId: workGoalId, nodeId: workNodeId });
	}

	async fail(workGoalId: string, workNodeId: string, reason: string): Promise<void> {
		await this.commands.failExecution({ goalId: workGoalId, nodeId: workNodeId, reason });
	}

	async accept(
		workGoalId: string,
		workNodeId: string,
		artifactId: string,
		actualMinutes: number,
	): Promise<void> {
		await this.commands.recordActualDuration({
			goalId: workGoalId,
			nodeId: workNodeId,
			actualMinutes,
		});
		await this.commands.acceptArtifact({ goalId: workGoalId, nodeId: workNodeId, artifactId });
	}
}
