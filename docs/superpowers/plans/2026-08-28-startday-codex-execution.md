# StartDay Codex Execution Implementation Plan
# 启动日代码智能执行代理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the desktop product to Codex app-server for structured work understanding and user-approved execution inside explicit local workspaces, with streamed progress, durable approvals, artifact verification, interruption, and recovery.

**Architecture:** A versioned newline-delimited JSON-RPC transport owns the Codex process and protocol. A higher-level adapter maps threads, turns, events, auth, models, approvals, and structured outputs into product-owned execution types; the application retains business rules and permission decisions.

**Tech Stack:** @openai/codex 0.150.1, Codex app-server stable stdio protocol, TypeScript 7.0.2, Electron 44.0.0, SQLite, Node.js child processes and streams.

**Spec:** `docs/superpowers/specs/2026-08-28-startday-codex-work-agent-design.md`

## Global Constraints

- Use stable app-server methods only; initialize without `experimentalApi`.
- Discover available models with `model/list`; prefer `gpt-5.6-terra`, then the server default.
- Use low reasoning for structured understanding and medium reasoning for execution.
- Bind every execution to explicit writable roots and disable network unless the plan declares web research.
- Never persist API keys, access tokens, or raw authorization headers in application storage or logs.
- Product permission policy can be stricter than app-server; it can never silently broaden a request.
- Destructive, outbound-message, publishing, payment, and account-permission operations remain denied in the first release.
- A successful model turn is not a completed work node; artifacts must verify and the user must accept them.
- Every task starts with a failing test and ends with all existing Node and Godot tests passing.
- Every commit message is Chinese and leaves a usable fallback when Codex is unavailable.

---

## File Map

- `src/execution/types.ts`: run, event, approval, artifact, and status contracts.
- `src/execution/state-machine.ts`: legal run transitions.
- `src/execution/repositories.ts`: execution persistence interfaces.
- `src/execution/permission-policy.ts`: allow, confirm, deny decisions.
- `src/execution/orchestrator.ts`: plan, approval, run, verify, cancel, and recover.
- `src/execution/artifacts.ts`: path containment, versioning, hashing, and verification.
- `src/storage/execution-repository.ts`: SQLite execution persistence.
- `src/codex/jsonrpc-transport.ts`: process lifecycle, request correlation, notifications, and server requests.
- `src/codex/app-server-client.ts`: initialization, auth, model list, thread, turn, interruption, and approval responses.
- `src/codex/event-mapper.ts`: app-server item events into user-visible execution events.
- `src/codex/work-interpreter.ts`: schema-constrained natural-language work drafts.
- `src/codex/execution-agent.ts`: planning and execution adapter.
- `src/desktop/codex-setup.ts`: availability and browser-login flow.
- `tests/codex/fixtures/fake-app-server.mjs`: deterministic protocol fixture process.
- `tests/codex/*.test.ts`: transport and adapter tests.
- `tests/execution/*.test.ts`: state, permission, orchestration, and artifact tests.
- `tests/integration/codex-real.test.ts`: opt-in real app-server sandbox test.

---

### Task 1: Define execution records and legal state transitions

**Files:**

- Create: `src/execution/types.ts`
- Create: `src/execution/state-machine.ts`
- Create: `src/execution/repositories.ts`
- Create: `tests/execution/state-machine.test.ts`

**Interfaces:**

- Produces: `ExecutionRun`, `ExecutionStatus`, `ExecutionEvent`, `ApprovalRequest`, `Artifact`.
- Produces: `transitionExecution(run, target, at) -> ExecutionRun`.

- [ ] **Step 1: Write failing transition tests**

```ts
test("执行必须经过规划、确认、运行和验证", () => {
  let run = sampleRun("queued");
  run = transitionExecution(run, "planning", now);
  run = transitionExecution(run, "awaitingApproval", now);
  run = transitionExecution(run, "running", now);
  run = transitionExecution(run, "verifying", now);
  run = transitionExecution(run, "succeeded", now);
  assert.equal(run.status, "succeeded");
  assert.throws(() => transitionExecution(run, "running", now));
});
```

Cover interruption to `paused`, cancellation from all non-terminal states, and failure from planning, running, or verifying.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/execution/state-machine.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement immutable execution contracts**

Use this status union:

```ts
export type ExecutionStatus =
  | "queued" | "planning" | "awaitingApproval" | "running"
  | "verifying" | "paused" | "succeeded" | "failed" | "canceled";
```

`ExecutionRun` includes work node id, goal, workspace roots, network flag, allowed tools, risk, app-server thread and turn ids, timestamps, error, and version. Define repository methods `saveRun`, `appendEvent`, `saveApproval`, `saveArtifact`, and corresponding reads.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/execution tests/execution/state-machine.test.ts
git commit -m "功能：建立执行任务状态和记录结构"
```

---

### Task 2: Enforce product-owned permission decisions

**Files:**

- Create: `src/execution/permission-policy.ts`
- Create: `tests/execution/permission-policy.test.ts`

**Interfaces:**

- Produces: `PermissionPolicy.evaluate(request, run) -> PermissionDecision`.
- Consumes: command, file-change, network, and outward-action requests.

- [ ] **Step 1: Write failing permission matrix tests**

```ts
test("工作目录外写入和删除操作第一版直接拒绝", () => {
  assert.equal(policy.evaluate(fileWrite("/tmp/outside.txt"), run).kind, "deny");
  assert.equal(policy.evaluate(command("rm", ["report.md"]), run).kind, "deny");
  assert.equal(policy.evaluate(fileCreate(`${workspace}/draft.md`), run).kind, "confirm");
  assert.equal(policy.evaluate(fileRead(`${workspace}/notes.md`), run).kind, "allow");
});
```

Add cases for overwrite, move, dependency install, tests, public web research, sending messages, publishing, payment, and permission changes.

- [ ] **Step 2: Run test and verify it fails**

Run: `node --test --import tsx tests/execution/permission-policy.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement normalized-path and action classification**

Resolve real parent paths before containment checks, reject symlink escapes, and classify decisions as `{ kind: "allow" }`, `{ kind: "confirm", risk, summary }`, or `{ kind: "deny", reason }`. Treat unknown requests as deny. Allow session-wide confirmation only for repeated creates inside the same workspace; never grant session-wide delete, network, or overwrite.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/execution/permission-policy.ts tests/execution/permission-policy.test.ts
git commit -m "安全：实现执行权限分级和目录隔离"
```

---

### Task 3: Implement the app-server JSON-RPC transport

**Files:**

- Modify: `package.json`
- Create: `src/codex/protocol.ts`
- Create: `src/codex/jsonrpc-transport.ts`
- Create: `tests/codex/fixtures/fake-app-server.mjs`
- Create: `tests/codex/jsonrpc-transport.test.ts`

**Interfaces:**

- Produces: `JsonRpcTransport.start`, `request`, `notify`, `respond`, `onNotification`, `onServerRequest`, `close`.
- Consumes: newline-delimited messages over child-process stdin/stdout.

- [ ] **Step 1: Write failing correlation, streaming, and shutdown tests**

```ts
test("传输层关联并发响应并转发服务端请求", async () => {
  const transport = await JsonRpcTransport.start(fakeServerCommand);
  const [first, second] = await Promise.all([
    transport.request("echo", { value: 1 }),
    transport.request("echo", { value: 2 }),
  ]);
  assert.deepEqual([first, second], [{ value: 1 }, { value: 2 }]);
  await transport.close();
});
```

Also test malformed JSON, server error response, process exit rejecting pending requests, 30-second timeout with injected shorter test timeout, and redaction of strings matching API-key patterns.

- [ ] **Step 2: Install the exact local Codex package and verify tests fail**

Run:

```bash
npm install @openai/codex@0.150.1
node --test --import tsx tests/codex/jsonrpc-transport.test.ts
```

Expected: missing transport module. Confirm `./node_modules/.bin/codex --version` succeeds; do not depend on the currently broken global installation.

- [ ] **Step 3: Implement newline framing and request lifecycle**

Use monotonically increasing numeric ids. Parse one JSON object per line. A message with `id` plus `result/error` resolves a client request; a message with `method` and no `id` is a notification; a message with both `method` and `id` is a server request that must receive `respond(id, result)`. Capture stderr into bounded diagnostic lines without secrets.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: tests close every child process and pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/codex tests/codex
git commit -m "功能：实现代码智能执行代理通信协议"
```

---

### Task 4: Add app-server lifecycle, auth, and model discovery

**Files:**

- Create: `src/codex/app-server-client.ts`
- Create: `src/codex/codex-locator.ts`
- Create: `tests/codex/app-server-client.test.ts`
- Create: `tests/codex/codex-locator.test.ts`

**Interfaces:**

- Produces: `CodexAppServer.connect`, `account`, `startChatGptLogin`, `listModels`, `startThread`, `startTurn`, `interruptTurn`, `answerApproval`, `close`.
- Consumes: `JsonRpcTransport` and local Codex executable.

- [ ] **Step 1: Write failing initialization and fallback-model tests**

```ts
test("连接后先初始化再查询账号并优先平衡模型", async () => {
  const client = await CodexAppServer.connect(fakeTransport);
  assert.deepEqual(fakeTransport.methods.slice(0, 3), ["initialize", "initialized", "account/read"]);
  assert.equal(await client.chooseModel(), "gpt-5.6-terra");
});
```

Also test browser login result, no-auth state, unavailable preferred model falling back to `isDefault`, and a clear unavailable result when no model exists.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/codex/app-server-client.test.ts tests/codex/codex-locator.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement stable protocol methods**

Send `initialize` with client name `startday_desktop`, title `启动日桌宠`, and package version, then `initialized`. Use `account/read`, `account/login/start` with `{ type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "chatgpt" }`, and `model/list`. Resolve the executable in order: `STARTDAY_CODEX_PATH`, local package binary, then `PATH`; verify it with `--version` before starting.

- [ ] **Step 4: Run all checks plus local availability**

Run:

```bash
npm test
npm run typecheck
./node_modules/.bin/codex --version
```

Expected: all pass and print version 0.150.1.

- [ ] **Step 5: Commit**

```bash
git add src/codex tests/codex
git commit -m "功能：接入执行代理账号和模型发现"
```

---

### Task 5: Understand work through schema-constrained turns

**Files:**

- Create: `src/work/interpreter.ts`
- Create: `src/codex/work-interpreter.ts`
- Create: `src/codex/work-draft-schema.ts`
- Create: `tests/codex/work-interpreter.test.ts`

**Interfaces:**

- Produces: `WorkInterpreter.interpret(text, profileContext) -> WorkDraftInterpretation`.
- Consumes: `CodexAppServer`, low effort, read-only sandbox, and `WorkDraft` validation.

- [ ] **Step 1: Write failing structured-draft and retry tests**

```ts
test("工作理解返回结构化草稿并保留关键假设", async () => {
  const interpretation = await interpreter.interpret(quarterlyReviewText, profile);
  assert.equal(interpretation.draft.title, "季度复盘");
  assert.equal(interpretation.draft.nodes.some((node) => node.owner === "小王"), true);
  assert.equal(interpretation.questions.length, 0);
});
```

Add a case where a missing deadline yields exactly one question and invalid structured output retries once before returning a Chinese error.

- [ ] **Step 2: Run test and verify it fails**

Run: `node --test --import tsx tests/codex/work-interpreter.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement output schema and prompt boundary**

Start a read-only thread with the selected model. Start the turn with `effort: "low"` and an `outputSchema` requiring title, deadline, milestones, nodes, assumptions, confidence, and at most one blocking question. The prompt states that the model extracts and estimates only; it must not calculate latest-start times or mutate records. Parse the final completed agent message as JSON and run `validateWorkDraft`.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/interpreter.ts src/codex tests/codex/work-interpreter.test.ts
git commit -m "功能：使用执行代理理解自然语言工作"
```

---

### Task 6: Map execution events and approvals into the product

**Files:**

- Create: `src/codex/event-mapper.ts`
- Create: `src/codex/execution-agent.ts`
- Create: `tests/codex/event-mapper.test.ts`
- Create: `tests/codex/execution-agent.test.ts`

**Interfaces:**

- Produces: `ExecutionAgent.plan(run)`, `execute(run)`, `approve(requestId, decision)`, `interrupt(run)`.
- Consumes: stable item events, `turn/completed`, command/file approval requests, and product permission policy.

- [ ] **Step 1: Write failing event and approval tests**

```ts
test("文件修改审批先经过产品权限策略", async () => {
  fakeServer.sendRequest(41, "item/fileChange/requestApproval", outsideWorkspaceChange);
  const approval = await nextEvent(agent);
  assert.equal(approval.type, "approvalDenied");
  assert.deepEqual(fakeServer.response(41), { decision: "decline" });
});
```

Cover plan deltas, command output summary, file change list, web search, agent messages, failed turns, interrupted turns, and `turn/completed` as authoritative terminal state.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/codex/event-mapper.test.ts tests/codex/execution-agent.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement planning and execution turns**

Planning uses a read-only turn and returns a Chinese plan plus declared resources. Execution uses:

```ts
{
  cwd: run.primaryWorkspace,
  approvalPolicy: "unlessTrusted",
  sandboxPolicy: {
    type: "workspaceWrite",
    writableRoots: run.writableRoots,
    readOnlyAccess: { type: "restricted", includePlatformDefaults: true, readableRoots: run.readableRoots },
    networkAccess: run.networkAllowed,
  },
  model: run.model,
  effort: "medium",
}
```

Product-allowed low-risk requests answer `accept`; confirm decisions become persisted approval events and wait for the renderer; denied requests answer `decline` immediately. Never use `acceptForSession` for deletion, overwrite, network, or directory expansion.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/codex tests/codex
git commit -m "功能：流式处理执行进度和权限审批"
```

---

### Task 7: Orchestrate execution, artifacts, verification, and recovery

**Files:**

- Create: `src/execution/orchestrator.ts`
- Create: `src/execution/artifacts.ts`
- Create: `src/storage/execution-repository.ts`
- Modify: `src/storage/migrations.ts`
- Create: `tests/execution/orchestrator.test.ts`
- Create: `tests/execution/artifacts.test.ts`
- Create: `tests/storage/execution-repository.test.ts`

**Interfaces:**

- Produces: `ExecutionOrchestrator.create`, `plan`, `confirmPlan`, `answerApproval`, `cancel`, `resume`, `acceptArtifact`.
- Produces: artifact hashes and verification results.

- [ ] **Step 1: Write failing orchestration acceptance tests**

```ts
test("成功执行只把节点推进到待验收", async () => {
  const run = await orchestrator.create(sampleRequest);
  await orchestrator.plan(run.id);
  await orchestrator.confirmPlan(run.id, confirmedScope);
  await fakeAgent.completeWithArtifact("复盘初稿.md");
  assert.equal((await repository.loadRun(run.id)).status, "succeeded");
  assert.equal((await workRepository.loadNode(run.workNodeId)).status, "review");
});
```

Add tests for failed verification, conflict creating a versioned copy, cancellation, paused-process recovery by thread id, and rejecting artifacts outside approved roots.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/execution/*.test.ts tests/storage/execution-repository.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement durable orchestration and schema version 2**

Add tables `execution_runs`, `execution_events`, `approvals`, and `artifacts`. Persist every state before starting the side effect that depends on it. Verify artifact existence, regular-file type, approved-root containment, nonzero size, and SHA-256 hash. For Markdown/text/code artifacts, run configured command or content checks; for other files, record basic verification and require user review. Acceptance changes the linked work node from `review` to `done` and records actual duration.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run build:desktop`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/execution src/storage tests/execution tests/storage
git commit -m "功能：完成执行编排和成果验收闭环"
```

---

### Task 8: Add account setup, execution UI, and real integration test

**Files:**

- Create: `src/desktop/codex-setup.ts`
- Modify: `src/desktop/application-service.ts`
- Modify: `src/desktop/ipc.ts`
- Modify: `src/desktop/preload.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/mini.html`
- Modify: `src/renderer/workbench.ts`
- Modify: `src/renderer/mini-panel.ts`
- Create: `tests/desktop/codex-setup.test.ts`
- Create: `tests/integration/codex-real.test.ts`
- Modify: `README.md`

**Interfaces:**

- Produces: setup status, ChatGPT browser login, model display, execution actions, approval responses, cancel/resume, and artifact open/accept.
- Consumes: all execution and Codex services.

- [ ] **Step 1: Write failing setup and opt-in integration tests**

```ts
test("未登录时返回可操作的账号设置状态", async () => {
  const state = await setup.readiness();
  assert.deepEqual(state, { ready: false, reason: "需要登录", canStartBrowserLogin: true });
});

test("真实代理只能在临时目录创建验收文件", { skip: process.env.STARTDAY_REAL_CODEX_TEST !== "1" }, async () => {
  const result = await runRealSandboxFixture();
  assert.equal(result.outsideWorkspaceChanges.length, 0);
  assert.equal(result.createdArtifactVerified, true);
});
```

- [ ] **Step 2: Run unit test and verify it fails**

Run: `node --test --import tsx tests/desktop/codex-setup.test.ts`

Expected: missing module. Keep the real test skipped until credentials are available.

- [ ] **Step 3: Implement setup and renderer flows**

At startup, show Codex executable, account, selected model, and rate-limit readiness. Browser login opens only the server-provided `authUrl` through Electron `shell.openExternal` after validating HTTPS and allowed host. The execution card shows plan, read/write roots, network status, risk, live events, pending approval, cancel/resume, artifacts, and accept result. Never render raw tokens or raw environment values.

- [ ] **Step 4: Run unit, fake integration, and real sandbox checks**

Run:

```bash
npm test
npm run typecheck
npm run build:desktop
STARTDAY_REAL_CODEX_TEST=1 node --test --import tsx tests/integration/codex-real.test.ts
```

Expected: all unit and fake tests pass. The real test starts app-server, creates one new file in a temporary directory, verifies it, makes no outside changes, and exits zero. If account setup is required, complete the displayed browser login and rerun the same command.

- [ ] **Step 5: Commit**

```bash
git add src/desktop src/renderer tests README.md
git commit -m "交付：完成代码智能执行代理工作闭环"
```
