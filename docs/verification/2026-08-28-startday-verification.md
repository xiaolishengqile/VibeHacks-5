# 启动日完整验收记录

验收对象：最终苹果芯片安装包 `release/启动日.app`。

验收原则：自动化测试使用隔离资料目录；真实执行只写入自动创建的临时工作目录；截图来自最终安装包；任何失败项都不能标记为通过。

## 需求与证据

| 需求 | 证据命令或文件 | 已观察结果 | 状态 |
|---|---|---|---|
| 一次启动桌面主程序和三维桌宠 | `npm run package`、`tests/e2e/desktop.spec.ts` | 最终应用同时启动工作台、轻面板和桌宠进程 | 通过 |
| 桌宠透明、置顶、可拖拽、可点击并正确表达状态 | `tests/test_main_scene.gd`、`tests/test_pet_status.gd`、`tests/desktop/windows.test.ts` | 七种业务状态均有动画参数，点击可重新打开隐藏面板 | 通过 |
| 轻面板文字输入、当前行动与原因 | `tests/e2e/desktop.spec.ts`、`artifacts/startday-mini-panel.png` | 输入可形成工作图，状态回执不会停留在假忙碌状态 | 通过 |
| 首次案例建立并确认基础个人工作模型 | `tests/work/command-service.test.ts`、`tests/e2e/fixtures.ts` | 确认前没有行动建议且不能执行，一次确认后生成排期 | 通过 |
| 示例需求形成工作节点、协作等待和里程碑 | `tests/demo/core-demo.test.ts`、`tests/e2e/desktop.spec.ts` | 季度复盘形成两节点流程并完成两个成果验收 | 通过 |
| 截止时间、里程碑、负责人和停止变化后重排 | `tests/work/command-service.test.ts` | 变更重新计算决策，停止操作先确认全部下游影响 | 通过 |
| 最晚开始时间由可解释规则计算 | `tests/work/decision-engine.test.ts`、`tests/work/schedule.test.ts` | 工作量、等待、缓冲、容量、里程碑和周末边界均通过 | 通过 |
| 用户选择目录、审阅计划并确认执行 | `tests/e2e/desktop.spec.ts` | 目录来自系统选择器，计划确认后才进入执行 | 通过 |
| 真实执行代理在授权目录创建成果 | `tests/integration/codex-real.test.ts`、`scripts/run-real-acceptance.mjs` | 真实账号与模型创建并验证非空成果，目录外哨兵未变化 | 通过 |
| 创建、覆盖、移动和安装依赖受审批控制 | `tests/execution/permission-policy.test.ts`、`tests/security/boundaries.test.ts` | 创建需确认；覆盖、移动和安装依赖需单次确认 | 通过 |
| 删除、目录越界、外部发送和高风险操作被拒绝 | `tests/security/boundaries.test.ts` | 删除、越界、发送、发布、支付、权限修改和未知操作均拒绝 | 通过 |
| 公开网络显式授权，内网始终拒绝 | `tests/security/boundaries.test.ts` | 本机、私网、链路本地、共享地址和内网地址均拒绝 | 通过 |
| 失败、取消和重启不会误标完成 | `tests/e2e/desktop.spec.ts`、`tests/execution/orchestrator.test.ts` | 失败与取消保持真实终态，相同资料目录重启后恢复 | 通过 |
| 成果、审批、执行日志可追溯 | `tests/storage/execution-repository.test.ts`、`artifacts/startday-execution-result.png` | 任务、顺序事件、审批和成果完整持久化并展示 | 通过 |
| 渲染窗口和桌宠通信保持最小权限 | `tests/security/boundaries.test.ts`、`tests/desktop/pet-bridge.test.ts` | 渲染窗口无系统模块权限，桥接拒绝伪造令牌和超大请求 | 通过 |
| 退出时清理执行代理与桌宠子进程 | `tests/security/process-cleanup.test.ts`、`tests/desktop/pet-process.test.ts` | 关闭时进程组被回收，主动停止后不会反复重启 | 通过 |
| 安装包不包含密钥、数据库、日志和测试资料 | `npm run verify:package`、`tests/security/secret-scan.test.ts` | 架构、资源、签名、版本和敏感内容扫描全部通过 | 通过 |
| 最终轻面板没有横向溢出且有关闭入口 | `tests/e2e/desktop.spec.ts`、`artifacts/startday-mini-panel.png` | 420 像素窗口无横向溢出，右上角“×”可隐藏并由桌宠重开 | 通过 |
| 语音识别按约定后续实现 | `src/renderer/mini.html`、`README.md` | 文字模式可用；语音按钮保留并明确标记后续开放 | 通过 |
| 最终安装包、真实成果和视觉证据完整 | `./scripts/run-all-checks.command`、`artifacts/startday-*.png` | 全量审计退出码为零，三张截图可读且来自最终安装包 | 通过 |

## 最终证据

- `artifacts/startday-workbench.png`：真实账号模型就绪、工作图和行动建议。
- `artifacts/startday-mini-panel.png`：右上角关闭入口、文字输入和无横向溢出的轻面板。
- `artifacts/startday-execution-result.png`：真实执行代理创建并验证的成果。
- `scripts/run-all-checks.command`：从业务测试到最终安装包和真实代理的完整审计入口。
