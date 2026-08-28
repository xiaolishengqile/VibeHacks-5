# StartDay Core Implementation Plan
# 启动日业务核心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested local business core that turns confirmed work drafts into a work graph, personal work model, explainable latest-start decisions, change commands, and durable local records.

**Architecture:** TypeScript modules contain pure domain rules and depend on repository interfaces. A Node SQLite adapter owns persistence, while model-based understanding is represented by an interface and added in the later Codex plan.

**Tech Stack:** Node.js 22.20, TypeScript 7.0.2, Node test runner through tsx 4.23.12, built-in node:sqlite.

**Spec:** `docs/superpowers/specs/2026-08-28-startday-codex-work-agent-design.md`

## Global Constraints

- Only support the current Apple Silicon Mac.
- First release accepts text input; do not add speech recognition.
- Decision calculations are deterministic and never delegated to a model.
- Store durations as integer minutes and instants as ISO-8601 strings with offsets.
- Keep every source file focused; split files before they exceed roughly 250 lines.
- Use dependency injection for clocks, identifiers, repositories, and work understanding.
- Every task starts with a failing test and ends with all existing tests passing.
- Every commit message is Chinese and leaves the repository runnable or testable.

---

## File Map

- `package.json`: Node, Electron, test, build, and package commands.
- `tsconfig.json`: strict TypeScript compilation for main and renderer modules.
- `src/shared/result.ts`: small success/failure result type.
- `src/shared/ids.ts`: injected identifier generator.
- `src/work/types.ts`: profile, goal, node, dependency, milestone, and draft contracts.
- `src/work/profile.ts`: confirmed profile updates and observed-duration learning.
- `src/work/graph.ts`: graph validation, descendant traversal, and state transitions.
- `src/work/schedule.ts`: work-calendar subtraction helpers.
- `src/work/decision-engine.ts`: latest-start and current-action decisions.
- `src/work/repositories.ts`: repository interfaces and aggregate snapshot contract.
- `src/work/command-service.ts`: create and change commands followed by replanning.
- `src/storage/database.ts`: database lifecycle and migrations.
- `src/storage/work-repository.ts`: SQLite implementation of work repositories.
- `src/demo/core-demo.ts`: deterministic command-line proof of the business loop.
- `tests/work/*.test.ts`: domain and command tests.
- `tests/storage/*.test.ts`: temporary-database tests.

---

### Task 1: Bootstrap the strict TypeScript test project

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/shared/result.ts`
- Create: `src/shared/ids.ts`
- Create: `tests/shared/result.test.ts`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `Result<T, E>`, `ok(value)`, `err(error)`, `IdGenerator.next(prefix)`.
- Produces: `npm test`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 1: Write the failing shared-result test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { err, ok } from "../../src/shared/result.js";

test("结果类型明确区分成功和失败", () => {
  assert.deepEqual(ok(3), { ok: true, value: 3 });
  assert.deepEqual(err("失败"), { ok: false, error: "失败" });
});
```

- [ ] **Step 2: Install exact development dependencies and verify the test fails**

Run:

```bash
npm init -y
npm install --save-dev typescript@7.0.2 tsx@4.23.12 @types/node@26.4.0
node --test --import tsx tests/shared/result.test.ts
```

Expected: failure because `src/shared/result.ts` does not exist.

- [ ] **Step 3: Add strict configuration and minimal shared interfaces**

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

```ts
export interface IdGenerator {
  next(prefix: string): string;
}

export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }
}
```

Set `package.json` to ESM with scripts:

```json
{
  "type": "module",
  "scripts": {
    "test": "node --test --import tsx tests/**/*.test.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  }
}
```

Set `tsconfig.json` to `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2023"`, `rootDir: "."`, and `outDir: "dist"`. Add `node_modules/`, `dist/`, `coverage/`, and `*.sqlite*` to `.gitignore`.

- [ ] **Step 4: Run all checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit zero.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/shared tests/shared
git commit -m "工程：建立启动日业务核心测试项目"
```

---

### Task 2: Define precise work-domain contracts

**Files:**

- Create: `src/work/types.ts`
- Create: `tests/work/types.test.ts`

**Interfaces:**

- Produces: `WorkProfile`, `WorkGoal`, `WorkNode`, `WorkDraft`, `Milestone`, `CollaboratorRef`, `WorkNodeStatus`.
- Consumes: ISO strings, integer minute values, and identifiers from Task 1.

- [ ] **Step 1: Write the failing contract-validation test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkDraft } from "../../src/work/types.js";

test("工作草稿拒绝缺少目标时间和负数工时", () => {
  const result = validateWorkDraft({
    title: "季度复盘",
    deadline: "",
    milestones: [],
    nodes: [{ title: "搭框架", owner: "self", workMinutes: -1, waitMinutes: 0, dependencyIndexes: [] }],
    assumptions: [],
  });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/work/types.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement immutable contracts and validation**

Use this exact status union:

```ts
export type WorkNodeStatus =
  | "planned" | "ready" | "running" | "waiting"
  | "review" | "done" | "stopped" | "failed";
```

Define `WorkDraftNode` with `title`, `owner`, `workMinutes`, `waitMinutes`, `dependencyIndexes`, and optional `potentialCollaborator`; define `WorkDraft` with `title`, `deadline`, `milestones`, `nodes`, and `assumptions`. Validation must reject blank titles, invalid dates, negative minutes, self-dependencies, out-of-range dependency indexes, and unconfirmed potential collaborators being marked as confirmed.

- [ ] **Step 4: Run the focused and full checks**

Run:

```bash
node --test --import tsx tests/work/types.test.ts
npm test
npm run typecheck
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/types.ts tests/work/types.test.ts
git commit -m "功能：定义精确的工作领域数据结构"
```

---

### Task 3: Build the basic personal work model

**Files:**

- Create: `src/work/profile.ts`
- Create: `tests/work/profile.test.ts`

**Interfaces:**

- Produces: `createProfile(input)`, `confirmProfileField(profile, field)`, `recordDurationObservation(profile, observation)`.
- Consumes: `WorkProfile` from Task 2.

- [ ] **Step 1: Write failing profile-learning tests**

```ts
test("实际耗时只影响同类型任务且保留来源", () => {
  const profile = createProfile({ timezone: "Asia/Shanghai", dailyCapacityMinutes: 420, bufferPercent: 20 });
  const updated = recordDurationObservation(profile, {
    taskType: "复盘框架", estimatedMinutes: 120, actualMinutes: 180, sourceWorkNodeId: "node_1",
  });
  assert.equal(updated.durationObservations[0]?.actualMinutes, 180);
  assert.equal(updated.durationObservations[0]?.sourceWorkNodeId, "node_1");
});
```

Also test capacity range `60..960`, buffer range `0..100`, and that inferred fields remain unconfirmed until `confirmProfileField` is called.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/work/profile.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement profile creation, confirmation, and observations**

Keep confirmed state per field:

```ts
export interface ConfirmedValue<T> {
  readonly value: T;
  readonly confirmed: boolean;
  readonly source: "user" | "inferred" | "observed";
  readonly updatedAt: string;
}
```

Never replace a user-confirmed capacity or buffer from a single observed task. Append observations and expose `suggestedMinutesFor(taskType)` as the median of the most recent five matching actual durations.

- [ ] **Step 4: Run tests and type checking**

Run: `npm test && npm run typecheck`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/profile.ts tests/work/profile.test.ts
git commit -m "功能：建立基础个人工作模型"
```

---

### Task 4: Implement work-graph invariants and state transitions

**Files:**

- Create: `src/work/graph.ts`
- Create: `tests/work/graph.test.ts`

**Interfaces:**

- Produces: `WorkGraph.create(goal, nodes)`, `descendantsOf(nodeId)`, `changeOwner`, `stopNodes`, `transitionNode`.
- Consumes: domain types from Task 2.

- [ ] **Step 1: Write failing cycle and stop-impact tests**

```ts
test("工作图拒绝循环依赖并返回受停止影响的下游节点", () => {
  assert.throws(() => WorkGraph.create(goal, [nodeAWithDependencyB, nodeBWithDependencyA]));
  const graph = WorkGraph.create(goal, [requestData, analyzeData, buildDeck]);
  assert.deepEqual(graph.descendantsOf(requestData.id), [analyzeData.id, buildDeck.id]);
});
```

Add a transition table test proving `planned -> ready -> running -> review -> done`, `ready -> waiting`, and any active state to `stopped`, while `done -> running` is rejected.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/work/graph.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement graph validation and immutable mutations**

Use Kahn topological sorting for cycle detection. `descendantsOf` must return topological order without duplicates. Mutation methods return a new `WorkGraph` so a failed command cannot partially mutate stored state.

- [ ] **Step 4: Run all core checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/graph.ts tests/work/graph.test.ts
git commit -m "功能：实现工作关系图和状态约束"
```

---

### Task 5: Calculate explainable latest-start decisions

**Files:**

- Create: `src/work/schedule.ts`
- Create: `src/work/decision-engine.ts`
- Create: `tests/work/schedule.test.ts`
- Create: `tests/work/decision-engine.test.ts`

**Interfaces:**

- Produces: `subtractWorkingMinutes(target, minutes, profile) -> string`.
- Produces: `DecisionEngine.replan(graph, profile, now) -> WorkDecision[]`.
- Consumes: work graph and profile from Tasks 3 and 4.

- [ ] **Step 1: Write failing boundary and quarterly-review tests**

```ts
test("等待、工作量和缓冲共同推前最晚开始时间", () => {
  const decisions = engine.replan(quarterlyReviewGraph, confirmedProfile, "2026-08-28T09:00:00+08:00");
  assert.equal(decisions[0]?.nodeId, "request_data");
  assert.match(decisions[0]?.reason ?? "", /等待/);
  assert.equal(decisions.find((item) => item.nodeId === "build_outline")?.recommendedAction, "start");
});
```

Add tests for work outside configured hours, weekends, internal milestone earlier than final deadline, capacity conflict, and zero waiting time.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/work/schedule.test.ts tests/work/decision-engine.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement schedule subtraction and decisions**

For each node:

```text
effective target = earliest final deadline or applicable milestone
after wait = effective target - calendar waiting minutes
buffer = ceil(self work minutes * confirmed buffer percent / 100)
latest start = subtract working minutes(after wait, self work + buffer, profile)
```

Rank waiting actions first, then overdue latest-start time, then smallest positive slack. Every decision includes `latestStart`, `recommendedAction`, `risk`, and a Chinese `reason` naming the values that caused it.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/schedule.ts src/work/decision-engine.ts tests/work
git commit -m "功能：实现可解释的最晚开始时间计算"
```

---

### Task 6: Add commands and automatic replanning

**Files:**

- Create: `src/work/repositories.ts`
- Create: `src/work/command-service.ts`
- Create: `tests/work/command-service.test.ts`

**Interfaces:**

- Produces: `WorkRepository.loadAggregate(goalId)`, `saveAggregate(aggregate)`.
- Produces: `CommandService.createFromDraft`, `changeDeadline`, `changeMilestone`, `changeOwner`, `prepareStop`, `confirmStop`, `recordActualDuration`, `acceptArtifact`.
- Consumes: `DecisionEngine`, `IdGenerator`, `WorkRepository`, and profile service.

- [ ] **Step 1: Write failing command tests**

```ts
test("更换协作方后保存历史并重新计算当前行动", async () => {
  const result = await service.changeOwner({ goalId: "goal_1", nodeId: "request_data", owner: "小赵" });
  assert.equal(result.aggregate.graph.node("request_data").owner, "小赵");
  assert.equal(result.change.reason, "协作方由小王变更为小赵");
  assert.ok(result.decisions.length > 0);
});
```

Add tests for deadline change, milestone change, stop confirmation token, affected descendants, actual duration observation, and rejecting an expired confirmation token.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/work/command-service.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement commands as load-validate-mutate-replan-save transactions**

`prepareStop` returns affected node ids and a random confirmation token without changing data. `confirmStop` accepts the same token once within five minutes. Each successful command returns `{ aggregate, decisions, change }`, where `change` names old and new values for the user-facing explanation.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/work/repositories.ts src/work/command-service.ts tests/work/command-service.test.ts
git commit -m "功能：实现任务变更命令和自动重排"
```

---

### Task 7: Persist work data with versioned SQLite migrations

**Files:**

- Create: `src/storage/database.ts`
- Create: `src/storage/migrations.ts`
- Create: `src/storage/work-repository.ts`
- Create: `tests/storage/database.test.ts`
- Create: `tests/storage/work-repository.test.ts`

**Interfaces:**

- Produces: `openDatabase(path)`, `migrateDatabase(db)`, `SqliteWorkRepository`.
- Consumes: repository interfaces from Task 6.

- [ ] **Step 1: Write failing migration and round-trip tests**

```ts
test("迁移可重复执行且完整保存工作聚合", async () => {
  const db = openDatabase(":memory:");
  migrateDatabase(db);
  migrateDatabase(db);
  const repository = new SqliteWorkRepository(db);
  await repository.saveAggregate(sampleAggregate);
  assert.deepEqual(await repository.loadAggregate(sampleAggregate.goal.id), sampleAggregate);
});
```

Also verify foreign keys are enabled and an invalid dependency cannot be persisted.

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test --import tsx tests/storage/*.test.ts`

Expected: missing modules.

- [ ] **Step 3: Implement schema version 1 and transactional repository writes**

Create tables for `profiles`, `goals`, `milestones`, `work_nodes`, `dependencies`, `changes`, and `duration_observations`. Use `PRAGMA user_version = 1`, `PRAGMA foreign_keys = ON`, and a single transaction per aggregate save. Map database rows in the adapter; do not expose SQL rows to domain code.

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests and compilation pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage tests/storage
git commit -m "功能：持久化工作模型和决策数据"
```

---

### Task 8: Prove the core loop with a deterministic demo

**Files:**

- Create: `src/demo/core-demo.ts`
- Create: `tests/demo/core-demo.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**

- Produces: `runCoreDemo(databasePath) -> Promise<DemoSummary>`.
- Consumes: all earlier core modules.

- [ ] **Step 1: Write the failing demo acceptance test**

```ts
test("季度复盘演示完成建图、重排和解释", async () => {
  const summary = await runCoreDemo(":memory:");
  assert.deepEqual(summary.nodeTitles, ["找协作方拿数据", "搭建复盘框架", "完成数据分析", "生成汇报材料", "老板审核"]);
  assert.equal(summary.changedOwner, "小赵");
  assert.match(summary.topReason, /等待|审核/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test --import tsx tests/demo/core-demo.test.ts`

Expected: missing demo module.

- [ ] **Step 3: Implement the demo and script**

Construct the confirmed quarterly-review draft, save it through `CommandService.createFromDraft`, change the collaborator from 小王 to 小赵, and print the current action plus reason. Add `"demo:core": "tsx src/demo/core-demo.ts"` to scripts and document the command in Chinese.

- [ ] **Step 4: Run the subsystem acceptance suite**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run demo:core
```

Expected: tests and build pass; demo prints the work graph, changed collaborator, current action, and explanation.

- [ ] **Step 5: Commit**

```bash
git add src/demo tests/demo package.json README.md
git commit -m "交付：完成启动日业务核心闭环"
```
