# StartDay Desktop Pet and UI Implementation Plan
# 启动日桌宠与界面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Godot pet into the entry and status surface for a secure Electron desktop application with a mini panel and complete workbench.

**Architecture:** Electron owns privileged services and exposes a narrow preload bridge to vanilla TypeScript renderers. The existing Godot process remains responsible for the 3D transparent pet and communicates with Electron over a loopback HTTP bridge protected by a random session token.

**Tech Stack:** Electron 44.0.0, TypeScript 7.0.2, Node.js built-ins, HTML/CSS, Godot 4.7.2, GDScript.

**Spec:** `docs/superpowers/specs/2026-08-28-startday-codex-work-agent-design.md`

## Global Constraints

- Preserve the existing furry 3D appearance, transparent overlay, drag, breathing, blink, gaze, and exported Apple Silicon app behavior.
- Click opens the mini panel; drag must not accidentally open it.
- The renderer never receives Node integration or direct file-system access.
- The pet bridge listens only on `127.0.0.1` and rejects missing or incorrect tokens.
- Text input only in the first release; render a disabled future-voice affordance only if it is clearly labeled unavailable.
- Every task starts with a failing test and ends with all existing Node and Godot tests passing.
- Every commit message is Chinese and leaves both the desktop app and standalone pet testable.

---

## File Map

- `src/desktop/main.ts`: Electron lifecycle and composition root.
- `src/desktop/windows.ts`: workbench and mini-panel window creation.
- `src/desktop/preload.ts`: typed, narrow renderer bridge.
- `src/desktop/ipc.ts`: validated renderer commands and event subscriptions.
- `src/desktop/pet-bridge.ts`: token-protected loopback server.
- `src/desktop/pet-process.ts`: Godot process start, health, and stop.
- `src/desktop/application-service.ts`: UI-oriented use cases over the work core.
- `src/renderer/index.html`: workbench document.
- `src/renderer/mini.html`: mini-panel document.
- `src/renderer/styles.css`: shared visual tokens and responsive layout.
- `src/renderer/workbench.ts`: workbench rendering and interactions.
- `src/renderer/mini-panel.ts`: action, input, plan, progress, and result view.
- `src/renderer/view-models.ts`: pure state-to-view transformations.
- `scripts/copy-static.mjs`: copy renderer assets into `dist`.
- `scripts/pet/pet_bridge_client.gd`: Godot bridge polling and events.
- `scripts/pet/pet_state.gd`: status validation and animation parameters.
- `tests/desktop/*.test.ts`: Electron-free service and bridge tests.
- `tests/renderer/*.test.ts`: pure view-model tests.
- `tests/test_pet_bridge.gd`: Godot bridge and click-threshold checks.

---

### Task 1: Bootstrap a secure Electron shell

**Files:**

- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `scripts/copy-static.mjs`
- Create: `src/desktop/main.ts`
- Create: `src/desktop/windows.ts`
- Create: `src/desktop/preload.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/mini.html`
- Create: `src/renderer/styles.css`
- Create: `tests/desktop/windows.test.ts`

**Interfaces:**

- Produces: `createWorkbenchWindow()`, `createMiniPanelWindow()`, and secure `webPreferences`.
- Consumes: compiled static assets under `dist/src/renderer`.

- [ ] **Step 1: Write the failing window-options test**

```ts
test("桌面窗口禁用渲染进程系统权限", () => {
  const options = workbenchWindowOptions();
  assert.equal(options.webPreferences?.nodeIntegration, false);
  assert.equal(options.webPreferences?.contextIsolation, true);
  assert.equal(options.webPreferences?.sandbox, true);
});
```

Also assert the mini panel is frameless, hidden initially, and always on top.

- [ ] **Step 2: Install Electron and verify the test fails**

Run:

```bash
npm install --save-dev electron@44.0.0
node --test --import tsx tests/desktop/windows.test.ts
```

Expected: missing window module.

- [ ] **Step 3: Implement the shell and static copy**

`main.ts` must wait for `app.whenReady()`, create the hidden workbench, create the hidden mini panel, and quit all child services from `before-quit`. Export option factories from `windows.ts` so tests do not import Electron. Add scripts:

```json
{
  "main": "dist/src/desktop/main.js",
  "scripts": {
    "build:desktop": "tsc && node scripts/copy-static.mjs",
    "start": "npm run build:desktop && electron ."
  }
}
```

The copy script copies both HTML files and `styles.css`; it deletes only `dist/src/renderer` after validating that path is inside the repository `dist` directory.

- [ ] **Step 4: Run checks and launch smoke test**

Run:

```bash
npm test
npm run typecheck
npm run build:desktop
npm start
```

Expected: workbench starts without renderer security warnings; close it manually after confirming the window loads.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json scripts/copy-static.mjs src/desktop src/renderer tests/desktop
git commit -m "工程：建立安全的桌面应用外壳"
```

---

### Task 2: Expose validated application commands through preload

**Files:**

- Create: `src/desktop/channels.ts`
- Create: `src/desktop/ipc.ts`
- Create: `src/desktop/application-service.ts`
- Modify: `src/desktop/preload.ts`
- Create: `src/renderer/global.d.ts`
- Create: `tests/desktop/application-service.test.ts`
- Create: `tests/desktop/ipc.test.ts`

**Interfaces:**

- Produces: `DesktopApi` with `getSnapshot`, `submitWorkText`, `runCommand`, `openWorkbench`, `chooseWorkDirectory`, and `subscribe`.
- Consumes: core `CommandService` and repositories from the previous plan.

- [ ] **Step 1: Write failing application and channel-validation tests**

```ts
test("渲染命令只允许白名单名称和结构化参数", async () => {
  const result = await invokeHandler("work:command", { name: "deleteEverything" });
  assert.deepEqual(result, { ok: false, error: "不支持的工作命令" });
});
```

Test that submitting blank text fails, work directory selection returns only user-selected paths, and subscription exposes sanitized user-visible events rather than raw process output.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/desktop/application-service.test.ts tests/desktop/ipc.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement the application facade and preload bridge**

Use a closed command union:

```ts
export type UiCommand =
  | { name: "changeDeadline"; goalId: string; deadline: string }
  | { name: "changeMilestone"; goalId: string; milestoneId: string; at: string }
  | { name: "changeOwner"; goalId: string; nodeId: string; owner: string }
  | { name: "prepareStop"; goalId: string; nodeId: string }
  | { name: "confirmStop"; goalId: string; token: string }
  | { name: "recordDuration"; goalId: string; nodeId: string; actualMinutes: number }
  | { name: "acceptArtifact"; goalId: string; nodeId: string; artifactId: string };
```

Expose only `contextBridge.exposeInMainWorld("startDay", desktopApi)`. Validate every incoming payload before calling the application service.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run build:desktop`

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/desktop src/renderer/global.d.ts tests/desktop
git commit -m "功能：建立受控的桌面业务通信接口"
```

---

### Task 3: Build workbench and mini-panel view models

**Files:**

- Create: `src/renderer/view-models.ts`
- Create: `tests/renderer/view-models.test.ts`

**Interfaces:**

- Produces: `toTodayActionView`, `toGraphView`, `toExecutionView`, `toPetStatus`.
- Consumes: sanitized application snapshots and execution summaries.

- [ ] **Step 1: Write failing mapping tests**

```ts
test("等待确认的执行优先映射为桌宠确认状态", () => {
  const view = toPetStatus({ topDecision: readyDecision, activeExecution: { status: "awaitingApproval" } });
  assert.equal(view, "awaiting_approval");
});
```

Cover no task, urgent task, thinking, running, verifying, completed, and failed. Verify `toTodayActionView` includes title, latest-start time, risk, and Chinese reason.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/renderer/view-models.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement pure view-model functions**

Use this precedence: awaiting approval, failed, executing, thinking, completed-within-10-seconds, urgent decision, idle. Do not access the DOM or Electron from this module.

- [ ] **Step 4: Run tests and type checking**

Run: `npm test && npm run typecheck`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/view-models.ts tests/renderer/view-models.test.ts
git commit -m "功能：建立桌宠和工作界面视图状态"
```

---

### Task 4: Implement the mini panel and complete workbench

**Files:**

- Modify: `src/renderer/index.html`
- Modify: `src/renderer/mini.html`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/dom.ts`
- Create: `src/renderer/workbench.ts`
- Create: `src/renderer/mini-panel.ts`
- Create: `tests/renderer/dom.test.ts`

**Interfaces:**

- Produces: complete text-input, today-action, work-graph, execution, approval, and artifact interactions.
- Consumes: `window.startDay` and view models from Task 3.

- [ ] **Step 1: Write failing safe-render tests**

```ts
test("用户输入作为文本渲染而不是插入网页标记", () => {
  const target = fakeElement();
  setText(target, "<img src=x onerror=alert(1)>");
  assert.equal(target.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(target.innerHTML, "");
});
```

Also test empty loading states and that the mini-panel submit button is disabled for blank input.

- [ ] **Step 2: Run test and verify it fails**

Run: `node --test --import tsx tests/renderer/dom.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement both renderers**

The mini panel contains, in order: current action, reason, one textarea, future voice icon labeled “后续开放”, quick change buttons, plan/permission card, progress summary, result link, and “打开工作台”. The workbench contains sections for today, graph, waiting collaborators, latest-start explanation, executions, approvals, artifacts, and decision history. Use `textContent` and created elements; never render user/model content through `innerHTML`.

- [ ] **Step 4: Run checks and visual smoke test**

Run:

```bash
npm test
npm run typecheck
npm run build:desktop
npm start
```

Expected: both windows render; submitting a fixture task updates today and graph views; responsive layout remains usable at 420×560 and 1180×760.

- [ ] **Step 5: Commit**

```bash
git add src/renderer tests/renderer
git commit -m "功能：实现桌宠轻面板和完整工作台"
```

---

### Task 5: Create the token-protected local pet bridge

**Files:**

- Create: `src/desktop/pet-bridge.ts`
- Create: `tests/desktop/pet-bridge.test.ts`

**Interfaces:**

- Produces: `PetBridge.start() -> { port, token }`, `setState(state)`, `onEvent(listener)`, `close()`.
- Consumes: `PetStatus` from view models.

- [ ] **Step 1: Write failing authentication and event tests**

```ts
test("桌宠桥接拒绝错误令牌并接受单击事件", async () => {
  const bridge = await PetBridge.start();
  assert.equal((await fetch(`${bridge.url}/state`)).status, 401);
  const received = oncePetEvent(bridge);
  await fetch(`${bridge.url}/event`, {
    method: "POST",
    headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "open_panel" }),
  });
  assert.deepEqual(await received, { type: "open_panel" });
});
```

Also verify non-loopback hosts are rejected and request bodies larger than 8 KiB receive status 413.

- [ ] **Step 2: Run test and verify it fails**

Run: `node --test --import tsx tests/desktop/pet-bridge.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement the bridge using Node HTTP only**

Bind to `127.0.0.1` with port `0`; generate 32 random bytes as the token. Provide `GET /state`, `POST /event`, and `GET /health`. Compare tokens with `timingSafeEqual` after length validation. Accept only event types `open_panel`, `quit_requested`, and `pet_ready`.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass and the test closes every server handle.

- [ ] **Step 5: Commit**

```bash
git add src/desktop/pet-bridge.ts tests/desktop/pet-bridge.test.ts
git commit -m "功能：实现安全的桌宠本机通信"
```

---

### Task 6: Connect the existing Godot pet to the desktop host

**Files:**

- Create: `scripts/pet/pet_state.gd`
- Create: `scripts/pet/pet_bridge_client.gd`
- Modify: `scripts/pet/pet_interaction.gd`
- Modify: `scripts/pet/pet_animator.gd`
- Modify: `scripts/main.gd`
- Modify: `tests/run_tests.gd`
- Create: `tests/test_pet_bridge.gd`

**Interfaces:**

- Produces: Godot signals `open_panel_requested` and `quit_requested`.
- Consumes: `STARTDAY_BRIDGE_PORT`, `STARTDAY_BRIDGE_TOKEN`, and `GET /state`.

- [ ] **Step 1: Write failing Godot state and click-threshold tests**

```gdscript
if PetStateScript.normalize("awaiting_approval") != "awaiting_approval":
	errors.append("等待确认状态必须保留")
if PetStateScript.normalize("unknown") != "idle":
	errors.append("未知状态必须回退待机")
if PetInteractionScript.is_click(Vector2(10, 10), Vector2(13, 12), 4.0) != true:
	errors.append("短距离按下松开必须识别为单击")
```

Register the test in `tests/run_tests.gd`.

- [ ] **Step 2: Run Godot tests and verify they fail**

Run: `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd`

Expected: missing scripts or methods.

- [ ] **Step 3: Implement bridge polling, click distinction, and status animation**

Poll `/state` every 500 ms with the bearer token. Post `open_panel` only when press-to-release distance is at most four logical pixels and drag never started. In integrated mode, right click posts `quit_requested`; in standalone mode it keeps the existing direct exit. Add deterministic animation multipliers for `idle`, `urgent`, `thinking`, `awaiting_approval`, `executing`, `completed`, and `failed` without changing the pet model.

- [ ] **Step 4: Run Godot and Node checks**

Run:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
npm test
npm run typecheck
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/pet scripts/main.gd tests
git commit -m "功能：让三维桌宠成为工作系统入口"
```

---

### Task 7: Manage the pet process and panel positioning

**Files:**

- Create: `src/desktop/pet-process.ts`
- Modify: `src/desktop/main.ts`
- Modify: `src/desktop/windows.ts`
- Create: `tests/desktop/pet-process.test.ts`
- Modify: `README.md`

**Interfaces:**

- Produces: `PetProcess.start(connection)`, `restartAfterCrash`, `stop`, and `showMiniPanelNearPet`.
- Consumes: built Godot app path in production and Godot executable plus project path in development.

- [ ] **Step 1: Write failing command and restart-policy tests**

```ts
test("开发模式通过环境变量向桌宠传递端口和令牌", () => {
  const launch = petLaunchSpec({ packaged: false, port: 43125, token: "secret" });
  assert.equal(launch.env.STARTDAY_BRIDGE_PORT, "43125");
  assert.equal(launch.env.STARTDAY_BRIDGE_TOKEN, "secret");
  assert.ok(launch.args.includes("--path"));
});
```

Verify at most three restarts in one minute and no restart after deliberate shutdown.

- [ ] **Step 2: Run test and verify it fails**

Run: `node --test --import tsx tests/desktop/pet-process.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement lifecycle and host composition**

The host starts the bridge, then pet, then subscribes to `open_panel`. Position the mini panel inside the display work area and near the pet window’s last reported screen corner; fall back to the bottom-right corner. On `quit_requested`, quit the entire desktop application. On host exit, close bridge and pet without restart.

- [ ] **Step 4: Run subsystem acceptance checks**

Run:

```bash
npm test
npm run typecheck
npm run build:desktop
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
npm start
```

Expected: desktop host starts pet; a click opens the mini panel; drag does not open it; workbench opens from the panel; quitting closes both processes.

- [ ] **Step 5: Commit**

```bash
git add src/desktop tests/desktop README.md
git commit -m "交付：完成桌宠入口和桌面工作台联动"
```
