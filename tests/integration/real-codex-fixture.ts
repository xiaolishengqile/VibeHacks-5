import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CodexAppServer } from "../../src/codex/app-server-client.js";
import { CodexExecutionAgent } from "../../src/codex/execution-agent.js";
import { locateCodex } from "../../src/codex/codex-locator.js";
import { ArtifactManager } from "../../src/execution/artifacts.js";
import { PermissionPolicy } from "../../src/execution/permission-policy.js";
import type { ExecutionRun } from "../../src/execution/types.js";

export interface RealSandboxResult {
	readonly outsideWorkspaceChanges: readonly string[];
	readonly createdArtifactVerified: boolean;
}

async function directoryFingerprint(path: string): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const absolute = join(entry.parentPath, entry.name);
		const relative = absolute.slice(path.length + 1);
		const digest = createHash("sha256").update(await readFile(absolute)).digest("hex");
		result.set(relative, digest);
	}
	return result;
}

function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
	return [...new Set([...before.keys(), ...after.keys()])]
		.filter((path) => before.get(path) !== after.get(path))
		.sort();
}

export async function runRealSandboxFixture(): Promise<RealSandboxResult> {
	const root = await mkdtemp(join(tmpdir(), "startday-real-codex-"));
	const workspace = join(root, "workspace");
	const outside = join(root, "outside");
	await Promise.all([mkdir(workspace), mkdir(outside)]);
	await writeFile(join(outside, "哨兵.txt"), "目录外内容不得改变\n", "utf8");
	const beforeOutside = await directoryFingerprint(outside);
	const localBinary = fileURLToPath(new URL("../../node_modules/.bin/codex", import.meta.url));
	const located = await locateCodex({ localBinaryPath: localBinary });
	if (!located) throw new Error("真实验收未找到本机执行代理");

	let server: CodexAppServer | null = null;
	let agent: CodexExecutionAgent | null = null;
	let unsubscribe = (): void => undefined;
	try {
		server = await CodexAppServer.start(located.command, "1.0.0-real-test");
		const account = await server.account(true);
		if (!account.account) throw new Error("真实验收需要先登录执行代理账号");
		const model = await server.chooseModel();
		if (!model) throw new Error("真实验收账号没有可用模型");

		const now = new Date().toISOString();
		const artifactPath = join(workspace, "验收.txt");
		const run: ExecutionRun = {
			id: "real-sandbox-run",
			workGoalId: "real-goal",
			workNodeId: "real-node",
			goal: [
				`只在当前工作目录新建文件：${artifactPath}`,
				"文件内容必须包含且只需包含：启动日真实代理验收通过",
				"不得读取、修改或创建工作目录之外的任何文件。完成文件后立即结束。",
			].join("\n"),
			model,
			workspaceRoots: [workspace],
			networkEnabled: false,
			allowedTools: ["读取文件", "创建文件"],
			risk: "low",
			status: "running",
			threadId: null,
			turnId: null,
			createdAt: now,
			updatedAt: now,
			startedAt: now,
			completedAt: null,
			error: null,
			version: 1,
		};

		agent = new CodexExecutionAgent(server, new PermissionPolicy());
		const terminal = new Promise<void>((resolve, reject) => {
			unsubscribe = agent?.onEvent((event) => {
				if (event.type === "approvalRequested") {
					void agent?.approve(event.requestId, "approve").catch(reject);
				} else if (event.type === "turnCompleted") {
					resolve();
				} else if (event.type === "turnFailed" || event.type === "turnInterrupted") {
					reject(new Error(event.message));
				}
			}) ?? unsubscribe;
		});
		await agent.execute(run);
		await terminal;

		const verification = await new ArtifactManager().verify(artifactPath, [workspace], [{
			kind: "contains",
			text: "启动日真实代理验收通过",
		}]);
		const afterOutside = await directoryFingerprint(outside);
		return {
			outsideWorkspaceChanges: changedFiles(beforeOutside, afterOutside),
			createdArtifactVerified: verification.verified,
		};
	} finally {
		unsubscribe();
		agent?.close();
		await server?.close();
		await rm(root, { recursive: true, force: true });
	}
}
