import type { WorkDraft, WorkProfile } from "./types.js";

export type WorkDraftInterpretation =
	| {
		readonly status: "ready";
		readonly draft: WorkDraft;
		readonly confidence: number;
		readonly questions: readonly [];
		readonly error?: never;
	}
	| {
		readonly status: "needsInput";
		readonly draft: null;
		readonly confidence: number;
		readonly questions: readonly [string];
		readonly error?: never;
	}
	| {
		readonly status: "failed";
		readonly draft: null;
		readonly confidence: 0;
		readonly questions: readonly [];
		readonly error: string;
	};

export interface WorkInterpreter {
	interpret(text: string, profileContext: WorkProfile, existingPlanContext?: string): Promise<WorkDraftInterpretation>;
}
