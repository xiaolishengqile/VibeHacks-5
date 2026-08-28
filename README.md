# 毛球桌宠

一个仅面向当前苹果芯片电脑的三维绿色绒毛桌宠，使用 Godot 4.7.2 制作。

![运行效果](artifacts/desktop-pet.png)

当前桌宠窗口为 285 × 250 像素，并佩戴可随身体动作自然摆动的奶油紫色贝雷帽。外圈独立长毛已经移除，只保留 48 层细腻短绒和参考图提炼的真实绒毛材质，内部使用 570 × 500 双倍尺寸渲染，让轮廓更加干净稳定。

成品只保留苹果芯片程序，不包含英特尔版本；同时包含玻璃眼睛、呼吸、眨眼、视线跟随和拖拽反馈。

## 启动

直接双击 `build/毛球桌宠.app` 使用成品。

开发时可双击 `scripts/run.command`，或在项目目录运行：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path .
```

需要重新生成成品时，双击 `scripts/export.command`。

## 操作

- 按住鼠标左键拖动桌宠。
- 移动鼠标时，桌宠视线会跟随光标。
- 单击或松开桌宠时会产生弹跳反馈。
- 单击鼠标右键退出。

## 自动检查

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
./tests/test_export_app.command
```
