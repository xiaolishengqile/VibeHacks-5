import type { ApplicationSnapshot, UiCommand, VisibleApplicationEvent } from "./application-service.js";
import type { Result } from "../shared/result.js";

export interface DesktopApi {
	getSnapshot(): Promise<Result<ApplicationSnapshot, string>>;
	submitWorkText(text: string): Promise<Result<ApplicationSnapshot, string>>;
	runCommand(command: UiCommand): Promise<Result<ApplicationSnapshot, string>>;
	openWorkbench(): Promise<Result<null, string>>;
	chooseWorkDirectory(): Promise<Result<string | null, string>>;
	subscribe(listener: (event: VisibleApplicationEvent) => void): () => void;
}
