import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ExecutionRun } from "./types.js";

export type FileOperation = "read" | "create" | "overwrite" | "delete" | "move";

export type PermissionRequest =
	| {
		readonly kind: "file";
		readonly operation: FileOperation;
		readonly path: string;
		readonly destinationPath?: string;
	}
	| { readonly kind: "command"; readonly executable: string; readonly args: readonly string[] }
	| { readonly kind: "workspacePatch"; readonly reason: string }
	| { readonly kind: "network"; readonly purpose: "research" | "download" | "other"; readonly url: string }
	| { readonly kind: "outward"; readonly action: "sendMessage" | "publish" | "payment" | "changePermission" }
	| { readonly kind: "unknown"; readonly value: unknown };

export type PermissionDecision =
	| { readonly kind: "allow"; readonly summary: string }
	| {
		readonly kind: "confirm";
		readonly risk: "low" | "medium";
		readonly summary: string;
		readonly sessionEligible: boolean;
	}
	| { readonly kind: "deny"; readonly reason: string };

const deny = (reason: string): PermissionDecision => ({ kind: "deny", reason });
const allow = (summary: string): PermissionDecision => ({ kind: "allow", summary });
const confirm = (
	risk: "low" | "medium",
	summary: string,
	sessionEligible = false,
): PermissionDecision => ({ kind: "confirm", risk, summary, sessionEligible });

const canonicalPath = (input: string): string => {
	const absolute = resolve(input);
	let ancestor = absolute;
	const suffix: string[] = [];
	while (!existsSync(ancestor)) {
		const parent = dirname(ancestor);
		if (parent === ancestor) break;
		suffix.unshift(basename(ancestor));
		ancestor = parent;
	}
	const realAncestor = realpathSync.native(ancestor);
	return suffix.length === 0 ? realAncestor : resolve(join(realAncestor, ...suffix));
};

const isContained = (root: string, target: string): boolean => {
	const child = relative(root, target);
	return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
};

const isPublicHttpUrl = (value: string): boolean => {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "localhost" || host === "::1" || host.startsWith("127.")) return false;
		if (host.startsWith("10.") || host.startsWith("192.168.")) return false;
		const private172 = /^172\.(\d+)\./.exec(host);
		if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
		return true;
	} catch {
		return false;
	}
};

export class PermissionPolicy {
	evaluate(request: PermissionRequest, run: ExecutionRun): PermissionDecision {
		switch (request.kind) {
			case "file":
				return this.#file(request, run);
			case "command":
				return this.#command(request, run);
			case "workspacePatch":
				return confirm("medium", request.reason || "修改已授权工作目录内的文件");
			case "network":
				return request.purpose === "research"
					&& run.networkEnabled
					&& run.allowedTools.includes("公开网页调研")
					&& isPublicHttpUrl(request.url)
					? allow(`只读调研公开网页：${request.url}`)
					: deny("当前执行未获准访问该网络资源");
			case "outward":
				return deny(this.#outwardReason(request.action));
			case "unknown":
				return deny("无法识别的操作默认拒绝");
		}
	}

	#file(request: Extract<PermissionRequest, { kind: "file" }>, run: ExecutionRun): PermissionDecision {
		if (request.operation === "delete") return deny("第一版禁止删除文件");
		const targetRoot = this.#containingRoot(request.path, run.workspaceRoots);
		if (!targetRoot) return deny("文件不在用户选择的工作目录内");
		if (request.operation === "read") {
			return run.allowedTools.includes("读取文件") ? allow(`读取文件：${request.path}`) : deny("执行计划未获准读取文件");
		}
		if (request.operation === "create") {
			return run.allowedTools.includes("创建文件")
				? confirm("low", `创建新成果：${request.path}`, true)
				: deny("执行计划未获准创建文件");
		}
		if (request.operation === "move") {
			if (!request.destinationPath || !this.#containingRoot(request.destinationPath, run.workspaceRoots)) {
				return deny("移动目标不在用户选择的工作目录内");
			}
			return confirm("medium", `移动文件：${request.path} → ${request.destinationPath}`);
		}
		return confirm("medium", `修改已有文件：${request.path}`);
	}

	#command(request: Extract<PermissionRequest, { kind: "command" }>, run: ExecutionRun): PermissionDecision {
		const executable = basename(request.executable).toLowerCase();
		if (["rm", "rmdir", "unlink", "shred"].includes(executable)) return deny("第一版禁止运行删除命令");
		const first = request.args[0]?.toLowerCase();
		if (
			(executable === "npm" && (first === "install" || first === "i"))
			|| (executable === "pnpm" && (first === "add" || first === "install"))
			|| (executable === "yarn" && first === "add")
			|| (executable === "pip" && first === "install")
		) return confirm("medium", `安装项目依赖：${executable} ${request.args.join(" ")}`);
		const isTest = (executable === "npm" && (first === "test" || (first === "run" && request.args[1]?.startsWith("test"))))
			|| (executable === "pnpm" && first === "test")
			|| (executable === "yarn" && first === "test")
			|| (executable === "node" && request.args.includes("--test"));
		if (isTest) {
			return run.allowedTools.includes("运行测试") ? allow("运行只读测试") : deny("执行计划未获准运行测试");
		}
		return deny("未分类命令默认拒绝");
	}

	#containingRoot(path: string, roots: readonly string[]): string | null {
		try {
			const target = canonicalPath(path);
			return roots.map(canonicalPath).find((root) => isContained(root, target)) ?? null;
		} catch {
			return null;
		}
	}

	#outwardReason(action: Extract<PermissionRequest, { kind: "outward" }>["action"]): string {
		return {
			sendMessage: "第一版禁止发送外部消息",
			publish: "第一版禁止对外发布",
			payment: "第一版禁止支付操作",
			changePermission: "第一版禁止修改账号或资源权限",
		}[action];
	}
}
