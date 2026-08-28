# 毛球桌宠

一个仅面向当前苹果芯片电脑的三维绿色绒毛桌宠。

## 启动

双击 `scripts/run.command`，或在项目目录运行：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path .
```

## 操作

- 按住鼠标左键拖动桌宠。
- 移动鼠标时，桌宠视线会跟随光标。
- 单击或松开桌宠时会产生弹跳反馈。
- 单击鼠标右键退出。

## 自动检查

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```
