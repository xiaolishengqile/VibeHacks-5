import type { CodexAppServer } from "../codex/app-server-client.js";
import { CodexExecutionAgent } from "../codex/execution-agent.js";
import { CodexWorkInterpreter } from "../codex/work-interpreter.js";
import { ArtifactManager } from "../execution/artifacts.js";
import { ExecutionOrchestrator, type WorkExecutionPort } from "../execution/orchestrator.js";
import { PermissionPolicy } from "../execution/permission-policy.js";
import type { ExecutionRepository } from "../execution/repositories.js";
import type { IdGenerator } from "../shared/ids.js";
import type { Clock } from "../work/repositories.js";
import type { WorkProfile } from "../work/types.js";
import type { VisibleApplicationEvent } from "./application-service.js";
import type { CodexSetup } from "./codex-setup.js";
import type { DesktopExecutionRuntime } from "./integrated-backend.js";
import { toVisibleAgentEvent } from "./integrated-backend.js";

interface RuntimeOptions {
	readonly setup: CodexSetup<CodexAppServer>;
	readonly repository: ExecutionRepository;
	readonly work: WorkExecutionPort;
	readonly ids: IdGenerator;
	readonly clock: Clock;
	readonly profile: WorkProfile;
	readonly readOnlyDirectory: string;
}

export async function createDesktopExecutionRuntime(
	options: RuntimeOptions,
	publish: (event: VisibleApplicationEvent) => void,
): Promise<DesktopExecutionRuntime> {
	const client = await options.setup.client();
	const agent = new CodexExecutionAgent(client, new PermissionPolicy());
	const orchestrator = new ExecutionOrchestrator(
		options.repository,
		agent,
		new ArtifactManager(),
		options.work,
		options.ids,
		options.clock,
	);
	const interpreter = new CodexWorkInterpreter(client, options.readOnlyDirectory);
	const unsubscribe = agent.onEvent((event) => publish(toVisibleAgentEvent(event, options.clock.now())));
	return {
		interpreter: { interpret: (text) => interpreter.interpret(text, options.profile) },
		orchestrator,
		close: async () => {
			unsubscribe();
			try {
				await agent.close();
			} finally {
				await orchestrator.close();
			}
		},
	};
}
