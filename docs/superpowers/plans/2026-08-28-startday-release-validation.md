# StartDay Release and Validation Implementation Plan
# 启动日发布与验收实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the complete Apple Silicon desktop product and prove every agreed requirement through automated, security, real-agent, visual, and restart testing.

**Architecture:** A deterministic packaging script builds Electron, exports the Godot pet, copies only required runtime resources, and creates one StartDay application bundle. Test fixtures isolate user data, while an end-to-end harness drives the packaged application and records evidence.

**Tech Stack:** Electron Packager 20.3.0, Playwright 1.62.1, Electron 44.0.0, Godot 4.7.2, Node.js 22.20, macOS 15.6.1 arm64.

**Spec:** `docs/superpowers/specs/2026-08-28-startday-codex-work-agent-design.md`

## Global Constraints

- Produce only an Apple Silicon application for the current Mac; do not add Intel or cross-platform artifacts.
- Package no secrets, user databases, logs, test workspaces, or global configuration.
- The packaged app must preserve the standalone pet appearance and start both host and pet with one launch.
- Real execution validation may create files only in a generated temporary workspace.
- Screenshot and log evidence must come from the final packaged build, not a development substitute.
- Every failing verification is fixed before the final completion claim.
- Every commit message is Chinese and each commit leaves a runnable or verifiable product.

---

## File Map

- `scripts/package-desktop.mjs`: validate inputs, export pet, build host, and package arm64 app.
- `scripts/verify-package.mjs`: inspect bundle architecture and required resources.
- `electron-packager.json`: explicit packaging allowlist and arm64 settings.
- `tests/e2e/fixtures.ts`: temporary profile, database, workspace, and fake agent setup.
- `tests/e2e/desktop.spec.ts`: window, task, graph, execution, approval, and restart flows.
- `tests/security/boundaries.test.ts`: traversal, symlink, renderer, token, secret, and approval attacks.
- `tests/test_pet_status.gd`: final pet status mapping tests.
- `scripts/run-all-checks.command`: one-command complete verification.
- `artifacts/startday-workbench.png`: final workbench screenshot.
- `artifacts/startday-mini-panel.png`: final pet and mini-panel screenshot.
- `artifacts/startday-execution-result.png`: final verified artifact screenshot.
- `docs/verification/2026-08-28-startday-verification.md`: requirement-to-evidence audit.
- `README.md`: installation, model login, permissions, operation, troubleshooting, and test commands.

---

### Task 1: Package one arm64 desktop application

**Files:**

- Modify: `package.json`
- Create: `electron-packager.json`
- Create: `scripts/package-desktop.mjs`
- Create: `scripts/verify-package.mjs`
- Create: `tests/package/package.test.ts`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `npm run package` and `npm run verify:package`.
- Produces: `release/启动日.app` containing host, pet, and local Codex runtime resources.

- [ ] **Step 1: Write the failing package-manifest test**

```ts
test("发布配置只生成苹果芯片应用并排除用户数据", async () => {
  const config = await readPackageConfig();
  assert.equal(config.platform, "darwin");
  assert.equal(config.arch, "arm64");
  assert.equal(config.ignore.some((value) => value.includes("*.sqlite")), true);
  assert.equal(config.extraResource.includes("build/毛球桌宠.app"), true);
});
```

- [ ] **Step 2: Install packager and verify the test fails**

Run:

```bash
npm install --save-dev @electron/packager@20.3.0
node --test --import tsx tests/package/package.test.ts
```

Expected: missing config or helper.

- [ ] **Step 3: Implement safe deterministic packaging**

Validate repository root, Godot executable, local Codex executable, and exact output directory before removing old output. Run the existing Godot export test, build Electron, package for `darwin-arm64`, copy the pet app into `Contents/Resources/pet`, and copy the resolved Codex native binary into `Contents/Resources/codex`. Update production lookup to use `process.resourcesPath`. Set the display name to `启动日` and bundle id to `com.startday.desktop`.

- [ ] **Step 4: Build and inspect the package**

Run:

```bash
npm run package
npm run verify:package
file release/启动日.app/Contents/MacOS/启动日
file release/启动日.app/Contents/Resources/codex/codex
```

Expected: both executables report arm64 or universal with arm64 support; required pet and Codex resources exist; no SQLite database, key-shaped string, or test workspace is present.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron-packager.json scripts tests/package .gitignore
git commit -m "交付：打包苹果芯片启动日桌面应用"
```

---

### Task 2: Add automated packaged-app end-to-end coverage

**Files:**

- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/desktop.spec.ts`
- Create: `tests/e2e/fake-agent.ts`

**Interfaces:**

- Produces: `npm run test:e2e` against the packaged Electron main entry.
- Consumes: isolated profile/data/workspace paths and deterministic fake execution events.

- [ ] **Step 1: Write the failing quarterly-review flow**

```ts
test("季度复盘从输入到成果验收完整闭环", async ({ startDay }) => {
  await startDay.submit("下周五做季度复盘，周三老板先看，数据找小王，先帮我搭框架");
  await startDay.confirmProfile();
  await startDay.expectNode("找协作方拿数据", "waiting");
  await startDay.changeOwner("找协作方拿数据", "小赵");
  await startDay.chooseFixtureWorkspace();
  await startDay.confirmPlan();
  await startDay.expectExecutionStatus("succeeded");
  await startDay.acceptArtifact("复盘初稿.md");
  await startDay.expectNode("搭建复盘框架", "done");
});
```

Add tests for stop impact confirmation, cancel, failure, restart recovery, and pet-click opening the panel through a test-only bridge event.

- [ ] **Step 2: Install Playwright and verify the flow fails**

Run:

```bash
npm install --save-dev @playwright/test@1.62.1
npx playwright install chromium
npm run test:e2e
```

Expected: missing fixture or application hooks.

- [ ] **Step 3: Implement isolated fixtures and stable test hooks**

Launch Electron with `STARTDAY_TEST_MODE=1`, a unique temporary data directory, fixture workspace, and fake agent module. Test mode may expose deterministic seed and bridge-trigger helpers only through the test preload and must be excluded from production builds. Preserve the same application service, permission policy, database, renderer, and state machines used in production.

- [ ] **Step 4: Run end-to-end tests twice**

Run:

```bash
npm run test:e2e
npm run test:e2e
```

Expected: both runs pass with no reused user data or lingering Electron, Godot, bridge, or fake-agent process.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e
git commit -m "测试：覆盖启动日桌面完整业务流程"
```

---

### Task 3: Prove security and failure boundaries

**Files:**

- Create: `tests/security/boundaries.test.ts`
- Create: `tests/security/secret-scan.test.ts`
- Create: `tests/security/process-cleanup.test.ts`

**Interfaces:**

- Produces: automated evidence for permission and secret invariants.
- Consumes: actual bridge, permission policy, preload surface, repositories, and process lifecycle.

- [ ] **Step 1: Write adversarial failing tests**

```ts
test("路径穿越和符号链接不能逃出工作目录", async () => {
  assert.equal((await policy.evaluate(fileCreate(`${workspace}/../outside.txt`), run)).kind, "deny");
  await createSymlink(`${workspace}/link`, outside);
  assert.equal((await policy.evaluate(fileCreate(`${workspace}/link/out.txt`), run)).kind, "deny");
});
```

Also attempt forged pet token, oversized body, unknown IPC channel, renderer `require`, unapproved overwrite, destructive command aliases, outbound-message wording, log injection with an API-key-shaped string, crash during execution, and app exit with active child processes.

- [ ] **Step 2: Run tests and verify at least the new tests fail before hardening**

Run: `node --test --import tsx tests/security/*.test.ts`

Expected: failures identify missing hardening or test helpers.

- [ ] **Step 3: Apply minimal fixes in the owning modules**

Fix each failure where responsibility belongs: canonicalize paths in permission policy, constant-time token checks in pet bridge, channel allowlist in IPC, redaction in transport diagnostics, and process groups in lifecycle shutdown. Do not add a second overlapping security layer in renderer code.

- [ ] **Step 4: Run complete security and regression suites**

Run:

```bash
node --test --import tsx tests/security/*.test.ts
npm test
npm run typecheck
npm run test:e2e
```

Expected: all pass and no child processes remain.

- [ ] **Step 5: Commit**

```bash
git add src tests/security
git commit -m "安全：验证并加固执行和桌面边界"
```

---

### Task 4: Run the real-agent acceptance scenario and capture visual evidence

**Files:**

- Create: `scripts/run-real-acceptance.mjs`
- Create: `tests/test_pet_status.gd`
- Modify: `tests/run_tests.gd`
- Create: `artifacts/startday-workbench.png`
- Create: `artifacts/startday-mini-panel.png`
- Create: `artifacts/startday-execution-result.png`

**Interfaces:**

- Produces: a repeatable real-account acceptance run in a temporary workspace.
- Consumes: packaged app, logged-in app-server, quarterly-review fixture notes, and screenshot hooks.

- [ ] **Step 1: Write the failing acceptance preflight**

The script must fail before launch unless all of these are true: packaged app exists, Codex binary starts, `account/read` reports a usable account or provider, preferred/default model exists, Godot pet resource exists, and a new temporary workspace was created.

- [ ] **Step 2: Run preflight and resolve only reported prerequisites**

Run: `node scripts/run-real-acceptance.mjs --preflight`

Expected: explicit pass/fail lines for each prerequisite. Complete browser login through the product if account readiness is the only failure, then rerun.

- [ ] **Step 3: Execute the fixed real scenario**

The script launches the packaged app, submits the quarterly-review request, confirms the profile and plan, grants only the temporary workspace, waits for a newly created `复盘初稿.md`, verifies no outside file changes, accepts the artifact, and captures the three screenshots. Add the final pet-status test to prove every execution state maps to a supported animation mode.

- [ ] **Step 4: Inspect screenshots and runtime logs**

Run:

```bash
node scripts/run-real-acceptance.mjs
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

Expected: the workbench, pet panel, and artifact screenshots are readable; the result file is nonempty; logs contain no repeated errors, secrets, outside writes, or false completed states.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-real-acceptance.mjs tests/test_pet_status.gd tests/run_tests.gd artifacts
git commit -m "测试：通过真实执行代理和桌面视觉验收"
```

---

### Task 5: Complete documentation and requirement-by-requirement audit

**Files:**

- Create: `scripts/run-all-checks.command`
- Create: `docs/verification/2026-08-28-startday-verification.md`
- Modify: `README.md`

**Interfaces:**

- Produces: one-command verification and traceable completion evidence.
- Consumes: every automated suite, package verifier, screenshots, and real-agent result.

- [ ] **Step 1: Write the audit checklist from the design acceptance criteria**

Create one row per criterion with columns: requirement, evidence command/file, observed result, and status. Include the explicit voice-deferred constraint, external/destructive denial, task change replan, profile establishment, pet behavior, real artifact, recovery, and audit-log requirements.

- [ ] **Step 2: Implement the complete verification command**

`scripts/run-all-checks.command` runs, with immediate failure propagation:

```bash
npm test
npm run typecheck
npm run build:desktop
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
./tests/test_export_app.command
npm run test:e2e
npm run package
npm run verify:package
STARTDAY_REAL_CODEX_TEST=1 node --test --import tsx tests/integration/codex-real.test.ts
node scripts/run-real-acceptance.mjs --verify-existing
```

- [ ] **Step 3: Update user documentation**

Document one-click launch, first text-based onboarding, ChatGPT browser login, selected model behavior, choosing a workspace, approval meanings, current supported work, deliberately denied operations, artifact acceptance, quit, recovery, troubleshooting, development commands, and the deferred voice feature. Never ask the user to paste a key into chat or documentation.

- [ ] **Step 4: Run the full completion audit from a clean process state**

Run:

```bash
./scripts/run-all-checks.command
git status --short
```

Expected: every check exits zero; audit rows have direct evidence and status “通过”; git status contains only the intended documentation/script changes before commit.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-all-checks.command docs/verification README.md
git commit -m "交付：完成启动日智能工作系统和验收说明"
```
