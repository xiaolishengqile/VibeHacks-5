# 启动日桌宠工作系统

一个仅面向当前苹果芯片电脑的本地智能工作系统。三维绿色绒毛桌宠是常驻入口，轻面板负责快速输入，完整工作台负责查看计划、依赖、权限、进度和成果。

![运行效果](artifacts/desktop-pet.png)

当前桌宠窗口为 264 × 231 像素。毛发由 48 层密集短绒、1.5 万根独立细毛和参考图提炼的真实绒毛材质共同组成，内部使用 528 × 462 双倍尺寸渲染。

成品只保留苹果芯片程序，不包含英特尔版本；同时包含玻璃眼睛、呼吸、眨眼、视线跟随和拖拽反馈。

## 启动

完整系统开发启动：

```bash
npm install
npm start
```

只启动独立桌宠时，可以双击 `build/毛球桌宠.app`。

开发时可双击 `scripts/run.command`，或在项目目录运行：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path .
```

需要重新生成成品时，双击 `scripts/export.command`。

## 操作

- 单击桌宠打开轻面板；拖拽不会误触打开。
- 按住鼠标左键拖动桌宠。
- 移动鼠标时，桌宠视线会跟随光标。
- 轻面板支持文字输入，语音入口标记为后续开放。
- 联动模式下右键桌宠会关闭桌宠和工作台；独立模式下只关闭桌宠。

## 自动检查

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
./tests/test_export_app.command
```

## 业务核心演示

下面的命令会用固定数据演示“创建季度复盘计划、自动倒排、变更协作方、重新计算当前行动”的完整闭环：

```bash
npm run demo:core
```
