# 工作秘书增量排期实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **给执行者：** 必须使用“子代理驱动开发”或“执行计划”技能逐项实施，并按复选框跟踪进度。

**Goal:** 在应用内部已有日历中安全加入新安排，保留既有任务身份与状态，让固定事项真实占时并驱动未来可移动任务避让。

**Architecture:** 用 `sourceNodeId` 把智能理解生成的替代草稿映射回当前工作图，用 `fixedStart` 表达不可移动日历占用。命令层负责完整性验证和原子替换，排期层先锁定固定事项再填充可移动任务；渲染层只消费最终排期结果。

**Tech Stack:** TypeScript、Node.js 内置 SQLite、Electron、Playwright、Node.js 测试运行器。

**Spec:** `docs/superpowers/specs/2026-08-29-incremental-calendar-secretary-design.md`

## Global Constraints

- 本阶段只处理应用内部日历，不接入系统或第三方日历。
- 每项生产代码修改都必须先有会正确失败的测试。
- 固定事项不添加安全缓冲，必须完整位于周一至周五的个人工作时段。
- 已完成和已停止节点不可被智能重排改写。
- 任何增量草稿或排期验证失败都不得修改原聚合。
- 每个完整功能提交使用中文提交说明。

---

### Task 1: 增量来源与固定时间数据结构

**Files:**
- Modify: `src/work/types.ts`
- Modify: `src/storage/migrations.ts`
- Modify: `src/storage/work-repository.ts`
- Test: `tests/work/types.test.ts`
- Test: `tests/storage/database.test.ts`
- Test: `tests/storage/work-repository.test.ts`

**Interfaces:**
- Consumes: 现有 `WorkNode`、`WorkDraftNode`、`validateWorkDraft()` 和数据库第三版结构。
- Produces: `WorkNode.fixedStart?: string`、`WorkDraftNode.sourceNodeId?: string` 和数据库第四版 `work_nodes.fixed_start`。

- [ ] **Step 1: 写草稿来源标识的失败测试**

在 `tests/work/types.test.ts` 构造合法草稿节点并加入 `sourceNodeId: "node_existing"`，断言 `validateWorkDraft()` 返回值完整保留该字段；再加入空白来源标识，断言返回来源标识错误。

```ts
const result = validateWorkDraft({
	...validDraft,
	nodes: [{ ...validDraft.nodes[0], sourceNodeId: "node_existing" }],
});
assert.equal(result.ok && result.value.nodes[0]?.sourceNodeId, "node_existing");
```

- [ ] **Step 2: 运行类型测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/types.test.ts`

Expected: FAIL，验证结果没有 `sourceNodeId`。

- [ ] **Step 3: 最小实现来源标识验证**

在 `WorkDraftNode` 增加可选来源标识，并在 `validateWorkDraft()` 中只接受非空字符串：

```ts
export interface WorkDraftNode {
	readonly sourceNodeId?: string;
	// 其余字段保持不变
}

const sourceNodeId = rawNode.sourceNodeId === undefined
	? undefined
	: trimmed(rawNode.sourceNodeId);
if (rawNode.sourceNodeId !== undefined && !sourceNodeId) {
	errors.push(`节点 ${index + 1} 的来源标识不能为空`);
}
```

- [ ] **Step 4: 写数据库升级与往返失败测试**

在 `tests/storage/database.test.ts` 把期望版本改为 4，并断言第二版、第三版数据库升级后存在 `fixed_start`。在 `tests/storage/work-repository.test.ts` 保存带 `fixedStart` 的节点并断言读取值不变。

```ts
assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 4);
assert.ok(database.prepare("PRAGMA table_info(work_nodes)").all()
	.some((column) => column.name === "fixed_start"));
```

- [ ] **Step 5: 运行存储测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/storage/database.test.ts tests/storage/work-repository.test.ts`

Expected: FAIL，版本仍为 3 且固定时间未持久化。

- [ ] **Step 6: 实现第四版迁移与仓储映射**

在 `WorkNode` 增加 `fixedStart?: string`，迁移增加列，并在插入、读取节点时映射：

```sql
ALTER TABLE work_nodes ADD COLUMN fixed_start TEXT;
```

数据库迁移上限和最终版本同步改为 4；旧节点读取后不包含 `fixedStart`。

- [ ] **Step 7: 运行本任务测试和类型检查**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/types.test.ts tests/storage/database.test.ts tests/storage/work-repository.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交完整数据结构功能**

```bash
git add src/work/types.ts src/storage/migrations.ts src/storage/work-repository.ts tests/work/types.test.ts tests/storage/database.test.ts tests/storage/work-repository.test.ts
git commit -m "增加增量来源与固定时间数据结构"
```

### Task 2: 固定事项优先占位

**Files:**
- Modify: `src/work/schedule.ts`
- Modify: `src/work/forward-schedule.ts`
- Test: `tests/work/schedule.test.ts`
- Test: `tests/work/forward-schedule.test.ts`

**Interfaces:**
- Consumes: `WorkNode.fixedStart`、`ScheduledWindow`、个人时区与工作日配置。
- Produces: `addCalendarMinutes()`、`workdayWindowAt()`、`validateFixedSchedule()`、固定事项冲突检测和可移动任务避让。

- [ ] **Step 1: 写固定事项占位的失败测试**

在 `tests/work/forward-schedule.test.ts` 安排固定会议周一 10:00—11:00，以及工作量 100 分钟、加缓冲后 120 分钟的可移动任务；断言可移动任务分配为 11:00—13:00，固定任务不含安全缓冲。

```ts
assert.deepEqual(windows.get("meeting")?.scheduledSegments, [{
	scheduledStart: "2026-08-31T10:00:00+08:00",
	scheduledEnd: "2026-08-31T11:00:00+08:00",
}]);
assert.equal(windows.get("draft")?.scheduledStart, "2026-08-31T11:00:00+08:00");
```

- [ ] **Step 2: 写固定事项边界与冲突的失败测试**

分别覆盖周末、18:00 后结束、两个固定事项重叠，断言抛出包含“工作时段”或“固定事项冲突”的中文错误。

- [ ] **Step 3: 运行排期测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/schedule.test.ts tests/work/forward-schedule.test.ts`

Expected: FAIL，固定节点仍被当作可移动任务。

- [ ] **Step 4: 增加自然分钟辅助函数**

在 `src/work/schedule.ts` 复用现有偏移解析和格式化函数，并导出按完整上下班时间计算的 `workdayWindowAt()`：

```ts
export function addCalendarMinutes(start: string, minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError("自然分钟必须是非负整数");
	const offset = parseOffsetMinutes(start);
	return formatWithOffset(Date.parse(start) + minutes * minuteMs, offset);
}
```

- [ ] **Step 5: 先锁定固定窗口再安排可移动任务**

增加 `validateFixedSchedule(nodes, profile): void`，遍历非终态固定节点：用 `workdayWindowAt()` 验证完整区间，按开始时间检测重叠。`buildForwardSchedule()` 先调用该函数，再把固定窗口加入 `reservations`，随后沿用现有空档分配算法安排其他节点。该验证函数也供命令层在个人容量尚未确认时执行，避免首次添加固定待办后才发现冲突。

固定节点窗口结构：

```ts
{
	scheduledStart: node.fixedStart,
	scheduledEnd: addCalendarMinutes(node.fixedStart, node.workMinutes),
	scheduledSegments: [{ scheduledStart: node.fixedStart, scheduledEnd }],
}
```

- [ ] **Step 6: 运行排期测试和类型检查**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/schedule.test.ts tests/work/forward-schedule.test.ts tests/work/decision-engine.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交固定事项排期功能**

```bash
git add src/work/schedule.ts src/work/forward-schedule.ts tests/work/schedule.test.ts tests/work/forward-schedule.test.ts
git commit -m "支持固定事项优先占用日历"
```

### Task 3: 原子增量重排命令

**Files:**
- Modify: `src/work/repositories.ts`
- Modify: `src/work/command-service.ts`
- Modify: `src/desktop/core-application.ts`
- Test: `tests/work/command-service.test.ts`
- Test: `tests/desktop/core-application.test.ts`

**Interfaces:**
- Consumes: `WorkDraftNode.sourceNodeId`、`WorkNode.fixedStart` 和现有聚合。
- Produces: `CommandService.reviseFromDraft({ goalId, draft })`、`FallbackWorkBackend.reviseFromDraft(draft)`、变更类型 `replanned`。

- [ ] **Step 1: 写保留身份和状态的失败测试**

在 `tests/work/command-service.test.ts` 建立一个已完成节点、一个运行节点和一个待规划节点，调用期望接口：

```ts
const result = await service.reviseFromDraft({
	goalId: "goal_1",
	draft: {
		title: "季度复盘与突发事项",
		deadline: "2026-09-04T18:00:00+08:00",
		milestones: [],
		nodes: [
			{ ...runningDraft, sourceNodeId: "running_node" },
			{ ...plannedDraft, sourceNodeId: "planned_node" },
			newDraft,
		],
		assumptions: ["用户是产品经理"],
	},
});
```

断言目标标识和创建时间不变、完成节点原样保留、运行节点仍是运行中、既有节点标识不变、新节点获得新标识、历史增加 `replanned`。

- [ ] **Step 2: 写来源完整性和原子失败测试**

覆盖遗漏既有未完成节点、重复来源标识、引用其他目标节点；断言调用失败且内存仓储中的原聚合深度相等。

- [ ] **Step 3: 运行命令测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/command-service.test.ts`

Expected: FAIL，`reviseFromDraft` 不存在。

- [ ] **Step 4: 实现来源映射和图重建**

在命令层先取得所有非终态节点标识集合，验证草稿来源集合完全一致且无重复。按草稿顺序生成节点标识数组，既有节点复用来源标识，新节点使用 `ids.next("node")`；依赖下标映射到该数组。

既有节点保留字段：

```ts
{
	...draftFields,
	id: existing.id,
	goalId: aggregate.graph.goal.id,
	status: existing.status,
	...(existing.actualMinutes === undefined ? {} : { actualMinutes: existing.actualMinutes }),
	...(existing.fixedStart ? { fixedStart: existing.fixedStart } : {}),
}
```

把终态节点追加回新图，目标复用 `id`、`createdAt`，用新假设更新 `description`，并追加 `replanned` 变更。

- [ ] **Step 5: 保存前完成排期验证**

调整私有 `#save()`：先对候选聚合调用 `#state()`，确认工作图和排期均有效，再调用 `repository.saveAggregate()`，保证固定事项冲突不会留下半成品。

- [ ] **Step 6: 暴露核心后端增量入口**

在 `FallbackWorkBackend` 增加：

```ts
async reviseFromDraft(draft: WorkDraft): Promise<ApplicationSnapshot> {
	const state = await this.#commands.readLatest();
	if (!state) return this.createFromDraft(draft);
	return this.#capture(await this.#commands.reviseFromDraft({
		goalId: state.aggregate.graph.goal.id,
		draft,
	}));
}
```

- [ ] **Step 7: 运行命令与核心后端测试**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/command-service.test.ts tests/desktop/core-application.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交原子增量重排功能**

```bash
git add src/work/repositories.ts src/work/command-service.ts src/desktop/core-application.ts tests/work/command-service.test.ts tests/desktop/core-application.test.ts
git commit -m "实现原子增量重排命令"
```

### Task 4: 完整计划上下文与智能重排路由

**Files:**
- Modify: `src/codex/work-draft-schema.ts`
- Modify: `src/codex/work-interpreter.ts`
- Modify: `src/desktop/integrated-backend.ts`
- Test: `tests/codex/work-interpreter.test.ts`
- Test: `tests/desktop/integrated-backend.test.ts`
- Test: `tests/e2e/fake-codex.mjs`

**Interfaces:**
- Consumes: `CoreBackend.reviseFromDraft()`、应用快照中的目标、节点和决策。
- Produces: 输出结构中的可选 `sourceNodeId`、包含职业线索与排期分段的完整上下文、已有目标走增量入口的路由。

- [ ] **Step 1: 写完整上下文的失败测试**

在 `tests/desktop/integrated-backend.test.ts` 设置现有目标，捕获解释器收到的上下文，断言包含：目标描述、里程碑节点关联、节点标识、依赖标识、状态、固定开始、详情，以及决策中的排期分段。

```ts
assert.match(context, /"sourceNodeId":"node_1"/);
assert.match(context, /"dependencyIds":\["node_0"\]/);
assert.match(context, /"scheduledSegments"/);
assert.match(context, /产品经理/);
```

- [ ] **Step 2: 写增量路由的失败测试**

第一次没有目标时断言调用 `createFromDraft()`；第二次已有目标时断言调用 `reviseFromDraft()`，并确认没有再次调用创建入口。

- [ ] **Step 3: 运行集成测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/desktop/integrated-backend.test.ts tests/codex/work-interpreter.test.ts`

Expected: FAIL，当前上下文缺少标识、依赖和排期，且总是调用创建入口。

- [ ] **Step 4: 扩展输出结构和提示约束**

在节点输出结构加入可选字符串 `sourceNodeId`。提示明确要求：现有未完成节点原样回传来源标识，新节点省略该字段；保留明确职业信息到 `assumptions`，信息不足时不得猜测职业。

- [ ] **Step 5: 构造完整且单一来源的现有上下文**

更新 `existingPlanContext()`，为每个非终态节点输出 `sourceNodeId: node.id`、`dependencyIds`、`fixedStart`、`latestStart`、`detail`，并从 `snapshot.decisions` 关联 `scheduledStart`、`scheduledEnd` 和 `scheduledSegments`。目标部分增加 `description`，里程碑保留 `nodeIds`。

- [ ] **Step 6: 已有目标改走增量重排**

扩展 `CoreBackend` 接口并修改 `submitText()`：

```ts
if (current.goal) await this.#options.core.reviseFromDraft(interpretation.draft);
else await this.#options.core.createFromDraft(interpretation.draft);
```

- [ ] **Step 7: 更新智能理解固定样例并运行测试**

让 `tests/e2e/fake-codex.mjs` 在收到现有上下文时，为既有节点回传对应 `sourceNodeId`；新节点不带来源。运行：

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/codex/work-interpreter.test.ts tests/desktop/integrated-backend.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交智能增量重排链路**

```bash
git add src/codex/work-draft-schema.ts src/codex/work-interpreter.ts src/desktop/integrated-backend.ts tests/codex/work-interpreter.test.ts tests/desktop/integrated-backend.test.ts tests/e2e/fake-codex.mjs
git commit -m "让智能理解保留并增量调整现有计划"
```

### Task 5: 手动固定待办与详情反馈

**Files:**
- Modify: `src/desktop/application-service.ts`
- Modify: `src/desktop/core-application.ts`
- Modify: `src/desktop/ipc.ts`
- Modify: `src/desktop/preload.cts`
- Modify: `src/renderer/workbench.ts`
- Modify: `src/renderer/task-detail-view.ts`
- Test: `tests/desktop/application-service.test.ts`
- Test: `tests/desktop/ipc.test.ts`
- Test: `tests/work/command-service.test.ts`
- Test: `tests/renderer/task-detail-view.test.ts`
- Test: `tests/e2e/desktop.spec.ts`

**Interfaces:**
- Consumes: 固定事项排期、`CommandService.addManualTodo()` 和现有原生对话框。
- Produces: `ManualTodoInput.durationMinutes`、默认 30 分钟的三步添加流程、详情卡固定时间标识。

- [ ] **Step 1: 写手动待办真实占时的失败测试**

在 `tests/work/command-service.test.ts` 传入 `durationMinutes: 45`，断言新节点：

```ts
assert.equal(todo.workMinutes, 45);
assert.equal(todo.fixedStart, "2026-08-31T10:00:00+08:00");
assert.equal(decision?.scheduledEnd, "2026-08-31T10:45:00+08:00");
```

同时添加同一时间的第二个固定待办，断言冲突失败且仓储仍只有第一个待办。

- [ ] **Step 2: 写桌面输入校验和详情失败测试**

应用服务与通信测试断言时长必须为 1—540 的整数；详情视图断言固定节点显示 `scheduleTypeLabel: "固定时间"`，普通节点显示 `"智能安排"`。

- [ ] **Step 3: 运行相关测试并确认失败**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/command-service.test.ts tests/desktop/application-service.test.ts tests/desktop/ipc.test.ts tests/renderer/task-detail-view.test.ts`

Expected: FAIL，时长未传递且节点没有固定时间。

- [ ] **Step 4: 贯通时长参数**

把 `ManualTodoInput` 改为：

```ts
export interface ManualTodoInput {
	readonly title: string;
	readonly at: string;
	readonly durationMinutes: number;
}
```

应用服务、通信层、预加载桥和核心后端原样传递，并在应用服务与命令服务边界验证整数范围 1—540。

- [ ] **Step 5: 创建固定节点并使用结束时间更新截止**

`addManualTodo()` 用 `durationMinutes` 写入 `workMinutes`，写入 `fixedStart: todo.at`，使用 `addCalendarMinutes()` 得到结束时间并更新目标截止；节点详情继续使用 `basicWorkNodeDetail()`。构建候选图后先调用 `validateFixedSchedule()`，即使个人每日容量尚未确认，也必须在保存前拒绝工作时段外或重叠的固定事项。

- [ ] **Step 6: 工作台增加原生时长输入**

在事项名称与时间之间调用现有 `requestText()`：

```ts
const duration = await requestText({
	title: "预计时长",
	message: "这项安排会占用多少分钟？",
	defaultValue: "30",
	inputType: "number",
	confirmLabel: "下一步",
});
```

解析失败或超出 1—540 时在 `today-reason` 显示中文错误，不发送请求。

- [ ] **Step 7: 详情卡显示固定属性**

在 `TaskDetailView` 增加 `scheduleTypeLabel`，并在详情头部元信息中显示。继续使用文本节点渲染，不插入用户提供的网页标记。

- [ ] **Step 8: 扩展完整桌面流程测试**

在 `tests/e2e/desktop.spec.ts` 的手动待办用例中输入 45 分钟，加入后断言日历范围显示 45 分钟、详情包含“固定时间”；再尝试同时间添加冲突事项并断言原计划未改变。

- [ ] **Step 9: 运行桌面相关测试和类型检查**

Run: `node --disable-warning=ExperimentalWarning --test --import tsx tests/work/command-service.test.ts tests/desktop/application-service.test.ts tests/desktop/ipc.test.ts tests/renderer/task-detail-view.test.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 10: 提交手动固定待办功能**

```bash
git add src/desktop/application-service.ts src/desktop/core-application.ts src/desktop/ipc.ts src/desktop/preload.cts src/renderer/workbench.ts src/renderer/task-detail-view.ts tests/desktop/application-service.test.ts tests/desktop/ipc.test.ts tests/work/command-service.test.ts tests/renderer/task-detail-view.test.ts tests/e2e/desktop.spec.ts
git commit -m "让手动待办真实占用固定时间"
```

### Task 6: 全量验证与交付审查

**Files:**
- Verify: `src/`
- Verify: `tests/`
- Verify: `release/启动日.app`

**Interfaces:**
- Consumes: 前五项完成的增量排期链路。
- Produces: 可验证安装包、干净工作区和审查结论。

- [ ] **Step 1: 运行全部静态与自动化检查**

Run: `npm run typecheck && npm test && git diff --check`

Expected: 类型检查通过；除既有真实代理环境用例按设计跳过外，其余检查全部通过；差异检查无输出。

- [ ] **Step 2: 生成并验证安装包**

Run: `npm run package && npm run verify:package`

Expected: 苹果芯片应用生成，架构、资源、版本、签名和敏感文件检查通过。

- [ ] **Step 3: 运行完整桌面流程**

Run: `npm run test:e2e`

Expected: 全部桌面流程通过，包括已有日历智能增量重排、固定待办冲突和所有任务详情点击。

- [ ] **Step 4: 请求只读代码审查**

审查范围从 `fb63f6e` 到当前提交，重点检查数据迁移、来源标识完整性、固定事项冲突、保存原子性和旧数据兼容。

- [ ] **Step 5: 修复审查中的重要问题并重新验证**

每个重要问题先补失败测试，再做最小修复；重复步骤 1—3，直到审查无重要问题。

- [ ] **Step 6: 确认工作区与提交记录**

Run: `git status --short && git log --oneline -8`

Expected: 工作区干净，每个提交都是中文且功能完整。
