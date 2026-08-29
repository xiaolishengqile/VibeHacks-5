import type { ApplicationSnapshot, UiCommand } from "./application-service.js";
import type { Result } from "../shared/result.js";

export type MiniPanelMode = "today" | "input";

export interface DesktopApi {
	getSnapshot(): Promise<Result<ApplicationSnapshot, string>>;
	submitWorkText(text: string): Promise<Result<ApplicationSnapshot, string>>;
	addManualTodo(todo: { readonly title: string; readonly at: string; readonly durationMinutes: number }): Promise<Result<ApplicationSnapshot, string>>;
	runCommand(command: UiCommand): Promise<Result<ApplicationSnapshot, string>>;
	openWorkbench(): Promise<Result<null, string>>;
	hideMiniPanel(): Promise<Result<null, string>>;
	onFocusInput(listener: () => void): () => void;
	onMiniPanelMode(listener: (mode: MiniPanelMode) => void): () => void;
	resetApplicationData(): Promise<Result<null, string>>;
	chooseWorkDirectory(): Promise<Result<string | null, string>>;
	subscribe(listener: () => void): () => void;
}
