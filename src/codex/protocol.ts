export type JsonRpcId = number | string;

export interface JsonRpcCommand {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
}

export interface JsonRpcNotification {
	readonly method: string;
	readonly params: unknown;
}

export interface JsonRpcServerRequest extends JsonRpcNotification {
	readonly id: JsonRpcId;
}

export interface JsonRpcError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

export type JsonRpcMessage =
	| { readonly id: JsonRpcId; readonly method: string; readonly params?: unknown }
	| { readonly method: string; readonly params?: unknown }
	| { readonly id: JsonRpcId; readonly result: unknown }
	| { readonly id: JsonRpcId; readonly error: JsonRpcError };
