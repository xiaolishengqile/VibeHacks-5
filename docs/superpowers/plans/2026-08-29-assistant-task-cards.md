# 个人助理任务卡片实施计划

> **供执行代理使用：** 必须逐项执行本计划，采用测试先行开发；可使用任务驱动开发或分批执行计划能力。

**目标：** 让工作日历展示真实执行时间和每日留白，并让每个任务点击后立即显示持久化的执行建议、交付标准、风险与兜底方案。

**架构：** 在工作草稿和工作节点之间增加结构化 `WorkNodeDetail`，通过第三版数据库迁移持久化；保留现有倒排风险计算，再用独立正向排期模块生成 `scheduledStart` 和 `scheduledEnd`。渲染层用独立详情视图模型组装新旧任务内容，工作台通过原生对话框展示，不在点击时调用模型。

**技术栈：** TypeScript、Node.js 内置测试、SQLite、Electron、原生 HTML 对话框、Playwright。

**设计文档：** `docs/superpowers/specs/2026-08-29-assistant-task-cards-design.md`

## 全局约束

- 工作只能安排在周一至周五和用户工作时段内。
- 每日最多占用 `dailyCapacityMinutes`，剩余时间必须作为留白显示。
- 任务详情在生成或重排时创建并保存，点击时不得调用模型。
- 旧任务和手动待办必须有本地基础详情兜底。
- 不引入新依赖，不增加卡片内编辑和日历拖拽改期。
- 每个功能提交使用中文提交信息，提交前必须通过相关测试。

---

### 任务一：结构化个人助理详情

**文件：**
- 修改：`src/work/types.ts`
- 修改：`src/codex/work-draft-schema.ts`
- 修改：`src/codex/work-interpreter.ts`
- 修改：`src/work/command-service.ts`
- 修改：`src/desktop/integrated-backend.ts`
- 修改：`src/desktop/core-application.ts`
- 修改：`tests/work/types.test.ts`
- 修改：`tests/codex/work-interpreter.test.ts`
- 修改：`tests/work/command-service.test.ts`
- 修改：`tests/e2e/fake-codex.mjs`
- 修改：其他因 `WorkDraft` 类型收紧而失败的测试夹具

**接口：**
- 产出：`WorkContingency`、`WorkNodeDetail`、`basicWorkNodeDetail(title)`。
- 产出：`WorkDraftNode.detail: WorkNodeDetail`。
- 产出：`WorkNode.detail?: WorkNodeDetail`，为旧数据保留可选兼容。
- 消费：后续持久化、详情视图和重新排期上下文。

- [ ] **步骤一：写草稿详情校验失败测试**

在 `tests/work/types.test.ts` 增加一个完整详情夹具，并验证缺少兜底时失败：

```ts
const detail = {
	summary: "先形成可审阅的活动方案，再锁定外部资源",
	steps: ["写出目标、流程和预算初稿"],
	deliverables: ["活动方案初稿"],
	successCriteria: ["方案包含目标、流程、预算和备选场地"],
	suggestions: ["先交最小可审版本，不等待所有信息齐全"],
	contingencies: [{
		risk: "老板未及时审核",
		trigger: "周二中午仍未收到反馈",
		action: "预约十五分钟短会并先推进无争议部分",
	}],
};

const invalid = validateWorkDraft({
	title: "活动方案",
	deadline: "2026-09-04T18:00:00+08:00",
	milestones: [],
	nodes: [{
		title: "写活动方案",
		owner: "self",
		workMinutes: 90,
		waitMinutes: 0,
		dependencyIndexes: [],
		detail: { ...detail, contingencies: [] },
	}],
	assumptions: [],
});
assert.equal(invalid.ok, false);
assert.match(invalid.ok ? "" : invalid.error.join("；"), /兜底/);
```

- [ ] **步骤二：运行测试确认因缺少详情校验而失败**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/work/types.test.ts
```

预期：失败，现有验证器会接受空兜底或忽略 `detail`。

- [ ] **步骤三：实现详情类型、校验和本地基础详情**

在 `src/work/types.ts` 增加：

```ts
export interface WorkContingency {
	readonly risk: string;
	readonly trigger: string;
	readonly action: string;
}

export interface WorkNodeDetail {
	readonly summary: string;
	readonly steps: readonly string[];
	readonly deliverables: readonly string[];
	readonly successCriteria: readonly string[];
	readonly suggestions: readonly string[];
	readonly contingencies: readonly WorkContingency[];
}

export const basicWorkNodeDetail = (title: string): WorkNodeDetail => ({
	summary: `完成「${title}」，并留下可检查的结果。`,
	steps: [`确认「${title}」的范围和所需资料`, `完成「${title}」并记录结果`],
	deliverables: [`「${title}」的完成结果`],
	successCriteria: ["结果可检查、可交付，未完成项已明确记录"],
	suggestions: ["先完成最小可交付版本，再补充细节"],
	contingencies: [{
		risk: "时间或资料不足",
		trigger: "开始时仍缺少完成任务所需的关键信息",
		action: "缩小范围，先交最小版本并标记待补内容",
	}],
});
```

给验证器增加非空字符串数组和兜底对象校验；`WorkDraftNode.detail` 必填，`WorkNode.detail` 可选。`CommandService.createFromDraft` 原样复制详情，`addManualTodo` 使用 `basicWorkNodeDetail`。

- [ ] **步骤四：写工作理解器的结构化详情失败测试**

修改 `tests/codex/work-interpreter.test.ts` 的真实返回夹具，让每个节点带 `detail`，并新增断言：

```ts
assert.deepEqual(result.status === "ready" ? result.draft?.nodes[0]?.detail.suggestions : [], [
	"先写完整叙事文稿，再制作演示页面",
	"缺失数据先用占位和待补标记，不空等协作方",
]);
```

同时验证提交给执行代理的结构要求包含详情字段，并将重新排期上下文中的旧详情传回模型。

- [ ] **步骤五：运行理解器测试确认结构边界失败**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/codex/work-interpreter.test.ts
```

预期：失败，输出结构尚不接受 `detail`，重新排期上下文也未包含详情。

- [ ] **步骤六：扩展输出结构和助理提示规则**

在 `src/codex/work-draft-schema.ts` 给节点增加必填 `detail`，所有数组设置 `minItems: 1`，兜底对象要求 `risk`、`trigger`、`action`。

在 `src/codex/work-interpreter.ts` 增加演示文稿、协作、方案类任务建议规则，明确每个节点必须生成具体交付物、可检查标准和至少一个兜底。更新 `existingPlanContext` 保留详情。

- [ ] **步骤七：修正现有草稿夹具并运行相关测试**

给本地降级草稿、演示草稿和测试用草稿补入 `basicWorkNodeDetail` 或完整字面量。

运行：

```bash
npm run typecheck
node --disable-warning=ExperimentalWarning --test --import tsx tests/work/types.test.ts tests/codex/work-interpreter.test.ts tests/work/command-service.test.ts tests/desktop/integrated-backend.test.ts
```

预期：类型检查和所列测试全部通过。

- [ ] **步骤八：提交结构化详情**

```bash
git add src tests
git commit -m "增加结构化个人助理任务详情"
```

---

### 任务二：持久化任务详情并兼容旧项目

**文件：**
- 修改：`src/storage/migrations.ts`
- 修改：`src/storage/work-repository.ts`
- 修改：`tests/storage/database.test.ts`
- 修改：`tests/storage/work-repository.test.ts`

**接口：**
- 消费：任务一的 `WorkNode.detail?: WorkNodeDetail`。
- 产出：数据库第三版 `work_nodes.detail_json` 可空字段。
- 产出：新任务详情完整往返；旧任务读取为 `detail === undefined`。

- [ ] **步骤一：写第二版数据库升级和详情往返失败测试**

在 `tests/storage/database.test.ts` 创建第二版完整数据库后执行迁移，断言：

```ts
assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 3);
const columns = database.prepare("PRAGMA table_info(work_nodes)").all().map((row) => row.name);
assert.equal(columns.includes("detail_json"), true);
```

在 `tests/storage/work-repository.test.ts` 给一个节点加入完整 `detail`，保持现有深比较断言。

- [ ] **步骤二：运行存储测试确认版本和往返失败**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/storage/database.test.ts tests/storage/work-repository.test.ts
```

预期：数据库版本仍为二，详情保存后丢失。

- [ ] **步骤三：实现第三版迁移和详情读写**

在 `src/storage/migrations.ts` 增加：

```sql
ALTER TABLE work_nodes ADD COLUMN detail_json TEXT;
```

将支持版本提高到三，并按一、二、三版顺序迁移。更新测试中无列名的 `INSERT INTO work_nodes VALUES`，明确列名，避免新增可空列破坏旧测试。

在 `src/storage/work-repository.ts` 的节点插入和读取中序列化、解析 `detail_json`；空值不添加 `detail` 属性。

- [ ] **步骤四：运行存储测试并提交**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/storage/database.test.ts tests/storage/work-repository.test.ts
```

预期：全部通过。

```bash
git add src/storage tests/storage
git commit -m "持久化个人助理任务详情"
```

---

### 任务三：生成真实时间段并保留每日空档

**文件：**
- 修改：`src/work/schedule.ts`
- 新建：`src/work/forward-schedule.ts`
- 修改：`src/work/decision-engine.ts`
- 修改：`tests/work/schedule.test.ts`
- 新建：`tests/work/forward-schedule.test.ts`
- 修改：`tests/work/decision-engine.test.ts`

**接口：**
- 产出：`alignToWorkingTime(value, profile, referenceOffset): string`。
- 产出：`addWorkingMinutes(start, minutes, profile): string`。
- 产出：`buildForwardSchedule(nodes, latestStarts, profile, now, referenceInstant): ReadonlyMap<string, ScheduledWindow>`。
- 产出：`WorkDecision.scheduledStart`、`WorkDecision.scheduledEnd`。

- [ ] **步骤一：写正向工作时间失败测试**

在 `tests/work/schedule.test.ts` 增加手算字面量：

```ts
assert.equal(
	addWorkingMinutes("2026-08-28T15:30:00+08:00", 90, profile),
	"2026-08-31T10:00:00+08:00",
);
assert.equal(
	alignToWorkingTime("2026-08-29T14:07:00+08:00", profile, "2026-09-04T18:00:00+08:00"),
	"2026-08-31T09:00:00+08:00",
);
```

- [ ] **步骤二：运行测试确认正向能力缺失**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/work/schedule.test.ts
```

预期：失败，两个函数尚不存在。

- [ ] **步骤三：最小实现正向工作时间函数**

复用 `schedule.ts` 已有的偏移解析、工作日判断和每日有效结束时间；不引入日期库。开始时间向十五分钟取整，周末、工作时段外和已达到每日容量时推进到下一个工作日开始。

- [ ] **步骤四：写依赖、等待、容量和留白排期失败测试**

在 `tests/work/forward-schedule.test.ts` 使用周六当前时间和两个依赖节点，断言：

```ts
assert.deepEqual([...windows.entries()], [
	["request", {
		scheduledStart: "2026-08-31T09:00:00+08:00",
		scheduledEnd: "2026-08-31T09:15:00+08:00",
	}],
	["draft", {
		scheduledStart: "2026-09-01T09:15:00+08:00",
		scheduledEnd: "2026-09-01T11:15:00+08:00",
	}],
]);
```

夹具中 `request` 工时十分钟、缓冲百分之二十、外部等待一天；`draft` 工时九十分钟。另一个夹具安排满每日七小时后，断言后续任务推进到下一工作日，且任何窗口均不落在周末。

- [ ] **步骤五：运行正向排期测试确认失败**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/work/forward-schedule.test.ts
```

预期：失败，正向排期模块尚不存在。

- [ ] **步骤六：实现独立正向排期模块并接入决策引擎**

`forward-schedule.ts` 只负责：按最晚开始时间选择节点、递归保证依赖先排、使用全局游标避免重叠、将 `workMinutes + ceil(workMinutes * bufferPercent / 100)` 向上取整为十五分钟时间块后占用容量、按自然分钟加入外部等待。

`DecisionEngine` 先保留现有倒排结果，再调用正向排期，给每个决定附上 `scheduledStart` 和 `scheduledEnd`。已完成、已停止和零工时节点使用原时间点，不占新容量。若实际开始晚于最晚开始，将风险提升为高并把排期冲突写入原因。

- [ ] **步骤七：运行排期与决策测试并提交**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/work/schedule.test.ts tests/work/forward-schedule.test.ts tests/work/decision-engine.test.ts
npm run typecheck
```

预期：全部通过。

```bash
git add src/work tests/work
git commit -m "增加工作日真实时间段与每日留白"
```

---

### 任务四：构建可展开的助理详情视图

**文件：**
- 修改：`src/renderer/calendar-view.ts`
- 新建：`src/renderer/task-detail-view.ts`
- 修改：`src/renderer/view-models.ts`
- 修改：`tests/renderer/calendar-view.test.ts`
- 新建：`tests/renderer/task-detail-view.test.ts`

**接口：**
- 消费：`WorkDecision.scheduledStart`、`scheduledEnd` 和 `WorkNode.detail`。
- 产出：`CalendarItemView.endDateTime`、时间范围标签、风险和占用分钟。
- 产出：`CalendarDayView.scheduledMinutes`、`reservedMinutes`。
- 产出：`toTaskDetailView(snapshot, nodeId): TaskDetailView | null`。

- [ ] **步骤一：写日历时间范围与留白失败测试**

在 `tests/renderer/calendar-view.test.ts` 给决定加入九点至十点三十分的实际时间，断言：

```ts
assert.equal(calendar.days[0]?.items[0]?.timeLabel, "09:00—10:30");
assert.equal(calendar.days[0]?.scheduledMinutes, 90);
assert.equal(calendar.days[0]?.reservedMinutes, 450);
```

周末两天断言 `scheduledMinutes === 0`，且没有任务。

- [ ] **步骤二：运行日历测试确认仍使用最晚开始时间而失败**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/renderer/calendar-view.test.ts
```

预期：失败，日历项没有结束时间和留白字段。

- [ ] **步骤三：实现日历视图字段**

日历项使用 `scheduledStart` 和 `scheduledEnd`，保留 `latestStart` 给详情卡；按开始、结束时间差累计当日已安排分钟，留白为完整工作时段分钟数减去已安排分钟，最低为零。每日容量仍是排期硬上限，因此即使任务排满容量，也会保留工作时段与容量之间的固定空档。

- [ ] **步骤四：写智能详情和旧数据兜底失败测试**

在 `tests/renderer/task-detail-view.test.ts` 分别传入带详情和无详情节点，断言：

```ts
assert.deepEqual(full?.suggestions, ["先写文字叙事，再制作演示页面"]);
assert.equal(full?.contingencies[0]?.trigger, "周三中午仍未拿到数据");
assert.match(fallback?.summary ?? "", /整理会议纪要/);
assert.equal((fallback?.contingencies.length ?? 0) > 0, true);
```

- [ ] **步骤五：运行详情视图测试确认模块缺失**

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/renderer/task-detail-view.test.ts
```

预期：失败，模块尚不存在。

- [ ] **步骤六：实现纯视图模型并运行测试**

`task-detail-view.ts` 只负责查找节点、决定和依赖标题；详情缺失时调用 `basicWorkNodeDetail`。返回内容全部是字符串和只读数组，不创建网页节点。

运行：

```bash
node --disable-warning=ExperimentalWarning --test --import tsx tests/renderer/calendar-view.test.ts tests/renderer/task-detail-view.test.ts tests/renderer/view-models.test.ts
```

预期：全部通过。

- [ ] **步骤七：提交视图模型**

```bash
git add src/renderer tests/renderer
git commit -m "增加任务详情与日历留白视图"
```

---

### 任务五：点击日历任务立即展开详情卡

**文件：**
- 修改：`src/renderer/workbench.ts`
- 修改：`src/renderer/styles.css`
- 修改：`tests/e2e/desktop.spec.ts`
- 修改：`tests/e2e/fixtures.ts`

**接口：**
- 消费：任务四的 `toTaskDetailView`。
- 产出：可聚焦的 `.calendar-event` 按钮和动态原生详情对话框。
- 保持：日历滑动、任务执行、审批和成果验收行为不变。

- [ ] **步骤一：写点击展开详情卡失败测试**

在 `tests/e2e/desktop.spec.ts` 提交包含活动和演示文稿的需求，点击一个日历任务，验证：

```ts
await startDay.workbench.getByRole("button", { name: /撰写晋升材料/ }).click();
const detail = startDay.workbench.getByRole("dialog", { name: /撰写晋升材料/ });
await expect(detail).toContainText("执行步骤");
await expect(detail).toContainText("交付物与完成标准");
await expect(detail).toContainText("助理建议");
await expect(detail).toContainText("风险与兜底");
await expect(detail).toContainText("先写文字叙事");
await detail.press("Escape");
await expect(detail).toHaveCount(0);
```

同时验证工作日底部出现“已保留”，周六和周日没有任务。

- [ ] **步骤二：重新打包并运行界面测试确认详情卡不存在**

运行：

```bash
npm run package
npx playwright test tests/e2e/desktop.spec.ts --grep "任务详情|每日留白"
```

预期：失败，日历事件仍是静态元素且没有详情对话框。

- [ ] **步骤三：实现可访问的任务按钮和详情对话框**

在 `workbench.ts` 中把日历事件创建为 `button`，点击时调用 `toTaskDetailView` 并创建单个 `dialog.app-dialog.task-detail-dialog`。标题、列表、风险和兜底全部通过 `createTextElement` 写入；关闭后移除对话框。给工作日列追加容量摘要。

在 `styles.css` 中只增加按钮重置、详情网格、列表、风险区和工作日留白摘要样式，不改变现有七列布局和颜色体系。

- [ ] **步骤四：运行针对性界面测试并修正回归**

运行：

```bash
npm run typecheck
npm run package
npx playwright test tests/e2e/desktop.spec.ts --grep "任务详情|每日留白|周日历切换|明亮的日历布局"
```

预期：全部通过。

- [ ] **步骤五：提交点击详情交互**

```bash
git add src/renderer tests/e2e
git commit -m "支持点击日历任务展开助理卡片"
```

---

### 任务六：全量回归和交付

**文件：**
- 检查：全部已修改文件
- 生成但不提交：`release/启动日.app`

**接口：**
- 验证完整产品流程，不增加新功能。

- [ ] **步骤一：核对需求逐项覆盖**

核对：每项可点击、详情持久化、演示文稿建议、具体兜底、实际时间段、每日留白、周末无工作、旧数据兜底。

- [ ] **步骤二：运行全部自动验证**

```bash
npm run typecheck
npm test
npm run package
npm run verify:package
npm run test:e2e
git diff --check
```

预期：类型检查通过；单元测试零失败；应用打包和安装包检查通过；桌面界面测试零失败；差异无空白错误。

- [ ] **步骤三：检查提交与工作区**

```bash
git status --short
git log -6 --oneline
```

预期：只有计划进度记录或没有未提交文件；每个功能提交均为中文且业务完整。
