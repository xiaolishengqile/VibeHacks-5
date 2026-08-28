#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
cd "$project_dir"

print '一、业务、权限和安全测试'
npm test

print '二、类型与桌面构建检查'
npm run typecheck
npm run build:desktop

print '三、桌宠项目、状态和导出检查'
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd

print '四、生成并检查最终苹果芯片安装包'
npm run package
./tests/test_export_app.command
npm run verify:package

print '五、最终安装包桌面端到端测试'
npm run test:e2e

print '六、真实执行代理临时目录验收'
STARTDAY_REAL_CODEX_TEST=1 node --test --import tsx tests/integration/codex-real.test.ts

print '七、最终界面证据检查'
node scripts/run-real-acceptance.mjs --verify-existing

print '启动日完整审计全部通过'
