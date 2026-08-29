export interface ApplicationResetDependencies {
	readonly closeBackend: () => Promise<void>;
	readonly closeCodex: () => Promise<void>;
	readonly clearData: () => void;
	readonly relaunch: () => void;
	readonly quit: () => void;
}

export async function runApplicationReset(dependencies: ApplicationResetDependencies): Promise<void> {
	let stopError: unknown = null;
	try {
		await dependencies.closeBackend();
	} catch (error) {
		stopError = error;
	}
	try {
		await dependencies.closeCodex();
	} catch (error) {
		stopError = stopError ?? error;
	}
	if (stopError) throw stopError;

	dependencies.clearData();
	dependencies.relaunch();
	dependencies.quit();
}
