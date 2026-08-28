# 蘑菇桌宠一比一重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **中文说明：** 必须使用计划执行规则在当前会话逐项实施；每一步使用复选框跟踪。

**Goal:** 将绿色毛球完整替换为高还原紫色蘑菇小人，并提供可持久化的六色右键选择菜单。

**Architecture:** 保留动画器依赖的外观接口，用短绒表面构建组件复用身体与帽子的材质逻辑，用蘑菇帽组件隔离帽顶、帽檐、斑点和换色。交互组件只负责菜单和事件，外观配置组件只负责颜色读写。

**Tech Stack:** Godot 4.7.2、GDScript、三维基础网格、壳层短绒着色器、ConfigFile、macOS 苹果芯片导出。

**Spec:** `docs/superpowers/specs/2026-08-28-mushroom-pet-redesign.md`

## 全局约束

- 默认帽色为紫色，提供紫、橙、黄、粉、蓝、绿六种预设色。
- 窗口为 300 × 330 像素，内部渲染为 600 × 660。
- 全身仅保留短绒，不生成外圈独立长毛。
- 保留呼吸、眨眼、视线跟随、拖拽和弹跳。
- 右键菜单同时提供颜色选择和退出，颜色跨启动保存。
- 成品只包含苹果芯片架构，目标帧率为 60 帧。

---

### 任务一：外观颜色配置

**文件：**

- 新建：`scripts/config/appearance_settings.gd`
- 新建：`tests/test_appearance_settings.gd`
- 修改：`tests/run_tests.gd`

**接口：**

- 产出：`AppearanceSettings.presets() -> Array[Dictionary]`
- 产出：`AppearanceSettings.default_color() -> Color`
- 产出：`AppearanceSettings.load_cap_color(path: String = SETTINGS_PATH) -> Color`
- 产出：`AppearanceSettings.save_cap_color(color: Color, path: String = SETTINGS_PATH) -> Error`

- [ ] **步骤 1：编写失败测试**

```gdscript
static func run() -> Array[String]:
	var errors: Array[String] = []
	var script_path := "res://scripts/config/appearance_settings.gd"
	if not ResourceLoader.exists(script_path):
		errors.append("必须提供外观颜色配置组件")
		return errors
	var settings = load(script_path)
	var path := "user://mushroom_pet_appearance_test.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	if settings.presets().size() != 6:
		errors.append("帽色必须提供六种预设")
	if settings.default_color() != Color("a985e8"):
		errors.append("默认帽色必须为紫色")
	if settings.save_cap_color(Color("ef7f45"), path) != OK:
		errors.append("帽色配置必须可以保存")
	elif settings.load_cap_color(path) != Color("ef7f45"):
		errors.append("帽色配置必须可以恢复")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	return errors
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

预期：失败信息为“必须提供外观颜色配置组件”。

- [ ] **步骤 3：实现最小配置组件**

```gdscript
class_name AppearanceSettings
extends RefCounted

const SETTINGS_PATH := "user://appearance.cfg"
const DEFAULT_COLOR := Color("a985e8")
const PRESETS := [
	{"label": "紫色", "color": DEFAULT_COLOR},
	{"label": "橙色", "color": Color("ef7f45")},
	{"label": "黄色", "color": Color("e7bd45")},
	{"label": "粉色", "color": Color("e99ab8")},
	{"label": "蓝色", "color": Color("78a9df")},
	{"label": "绿色", "color": Color("86bc82")},
]

static func presets() -> Array[Dictionary]:
	return PRESETS.duplicate(true)

static func default_color() -> Color:
	return DEFAULT_COLOR

static func load_cap_color(path: String = SETTINGS_PATH) -> Color:
	var config := ConfigFile.new()
	if config.load(path) != OK:
		return DEFAULT_COLOR
	var color = config.get_value("appearance", "cap_color", DEFAULT_COLOR)
	return color if color is Color else DEFAULT_COLOR

static func save_cap_color(color: Color, path: String = SETTINGS_PATH) -> Error:
	var config := ConfigFile.new()
	config.set_value("appearance", "cap_color", color)
	return config.save(path)
```

- [ ] **步骤 4：运行完整测试并确认通过**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

- [ ] **步骤 5：提交完整配置能力**

```bash
git add scripts/config/appearance_settings.gd scripts/config/appearance_settings.gd.uid tests/test_appearance_settings.gd tests/test_appearance_settings.gd.uid tests/run_tests.gd
git commit -m "功能：增加蘑菇帽颜色配置"
```

### 任务二：高还原蘑菇模型

**文件：**

- 新建：`scripts/pet/plush_surface_builder.gd`
- 新建：`scripts/pet/mushroom_cap_builder.gd`
- 修改：`scripts/pet/pet_visual.gd`
- 修改：`scripts/config/pet_config.gd`
- 修改：`scripts/desktop/desktop_window_controller.gd`
- 修改：`shaders/fur_shell.gdshader`
- 修改：`project.godot`
- 修改：`tests/test_pet_visual.gd`
- 修改：`tests/test_config.gd`
- 修改：`tests/test_window_geometry.gd`
- 删除：`scripts/pet/hat_builder.gd`
- 删除：`scripts/pet/hat_builder.gd.uid`

**接口：**

- 产出：`PlushSurfaceBuilder.create_surface(node_name, mesh, scale, color, shell_count, fur_length) -> Node3D`
- 产出：`PlushSurfaceBuilder.recolor(surface: Node3D, color: Color) -> void`
- 产出：`MushroomCapBuilder.create(cap_color: Color) -> Node3D`
- 产出：`MushroomCapBuilder.set_color(cap: Node3D, color: Color) -> void`
- 保留：`PetVisual.set_body_pose`、`set_blink`、`set_gaze`、`set_shadow`
- 新增：`PetVisual.set_cap_color(color: Color) -> void`

- [ ] **步骤 1：把外观测试改为蘑菇结构并确认失败**

```gdscript
var visual := PetVisualScript.new()
visual.build()
for path in [
	"Body/BodySurface/Base",
	"Body/MushroomCap/Top/Base",
	"Body/MushroomCap/Rim",
	"Body/Face",
	"Body/Eyes/Left",
	"Body/Eyes/Right",
	"Body/LeftArm",
	"Body/RightArm",
	"Body/LeftFoot",
	"Body/RightFoot",
]:
	if visual.get_node_or_null(path) == null:
		errors.append("蘑菇造型缺少节点：%s" % path)
var spots := visual.get_node_or_null("Body/MushroomCap/Spots")
if spots == null or spots.get_child_count() != 5:
	errors.append("蘑菇帽必须包含五个白色斑点")
if visual.get_node_or_null("Body/Hat") != null:
	errors.append("旧贝雷帽必须移除")
visual.set_cap_color(Color("ef7f45"))
var cap_material := (visual.get_node("Body/MushroomCap/Top/FurShells/Shell00") as MeshInstance3D).material_override
if cap_material.get_shader_parameter("fur_color") != Color("ef7f45"):
	errors.append("蘑菇帽必须支持即时换色")
```

同时把窗口断言改为 300 × 330、内部渲染改为 600 × 660，并验证帽顶可见宽度至少为身体的 1.45 倍。

- [ ] **步骤 2：运行完整测试并确认失败**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

预期：失败信息包含缺少蘑菇帽、脸、手脚和新窗口尺寸。

- [ ] **步骤 3：实现短绒表面构建器**

```gdscript
class_name PlushSurfaceBuilder
extends RefCounted

const FUR_SHADER = preload("res://shaders/fur_shell.gdshader")
const FUR_TEXTURE = preload("res://assets/textures/fur_plush.png")

static func create_surface(
	node_name: String,
	mesh: PrimitiveMesh,
	scale: Vector3,
	color: Color,
	shell_count: int,
	fur_length: float,
) -> Node3D:
	var surface := Node3D.new()
	surface.name = node_name
	var base := MeshInstance3D.new()
	base.name = "Base"
	base.mesh = mesh
	base.scale = scale
	base.material_override = _solid_material(color.darkened(0.08))
	surface.add_child(base)
	var shells := Node3D.new()
	shells.name = "FurShells"
	surface.add_child(shells)
	for index in shell_count:
		var shell := MeshInstance3D.new()
		shell.name = "Shell%02d" % index
		shell.mesh = mesh
		shell.scale = scale
		var material := ShaderMaterial.new()
		material.shader = FUR_SHADER
		material.set_shader_parameter("shell_ratio", float(index) / float(shell_count - 1))
		material.set_shader_parameter("fur_color", color)
		material.set_shader_parameter("fur_length", fur_length)
		material.set_shader_parameter("fur_texture", FUR_TEXTURE)
		shell.material_override = material
		shells.add_child(shell)
	return surface

static func recolor(surface: Node3D, color: Color) -> void:
	(surface.get_node("Base") as MeshInstance3D).material_override.albedo_color = color.darkened(0.08)
	for shell in surface.get_node("FurShells").get_children():
		(shell as MeshInstance3D).material_override.set_shader_parameter("fur_color", color)

static func _solid_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.96
	return material
```

着色器把绒毛贴图转换为亮度细节后乘以 `fur_color`，确保紫、橙、黄、粉、蓝、绿都不会受原贴图底色污染。

- [ ] **步骤 4：实现蘑菇帽组件**

```gdscript
static func create(cap_color: Color) -> Node3D:
	var cap := Node3D.new()
	cap.name = "MushroomCap"
	var top_mesh := SphereMesh.new()
	top_mesh.radius = 0.96
	top_mesh.height = 0.82
	top_mesh.radial_segments = 96
	top_mesh.rings = 48
	var top := PlushSurfaceBuilderScript.create_surface(
		"Top", top_mesh, Vector3(1.0, 1.0, 0.78), cap_color, 32, 0.04
	)
	top.position = Vector3(0.0, 0.52, 0.0)
	cap.add_child(top)
	var rim := _sphere("Rim", 0.84, 0.50, Color("f5e8c9"), Vector3(1.0, 1.0, 0.52))
	rim.position = Vector3(0.0, 0.18, 0.30)
	cap.add_child(rim)
	var spots := Node3D.new()
	spots.name = "Spots"
	cap.add_child(spots)
	var spot_data := [
		[Vector3(-0.56, 0.58, 0.72), Vector3(1.25, 0.85, 0.28)],
		[Vector3(-0.25, 0.78, 0.68), Vector3(0.80, 0.65, 0.24)],
		[Vector3(0.18, 0.81, 0.67), Vector3(1.00, 0.70, 0.24)],
		[Vector3(0.56, 0.57, 0.71), Vector3(1.10, 0.90, 0.26)],
		[Vector3(0.42, 0.35, 0.74), Vector3(0.72, 0.55, 0.22)],
	]
	for index in spot_data.size():
		var spot := _sphere("Spot%02d" % index, 0.14, 0.16, Color("fff4e2"), spot_data[index][1])
		spot.position = spot_data[index][0]
		spots.add_child(spot)
	return cap

static func set_color(cap: Node3D, color: Color) -> void:
	PlushSurfaceBuilderScript.recolor(cap.get_node("Top"), color)
```

`_sphere` 创建高细分 `SphereMesh` 和高粗糙度实体材质；帽顶换色不改变白斑和帽檐。

- [ ] **步骤 5：重写外观组装**

```gdscript
func _build_body() -> void:
	_body_root = Node3D.new()
	_body_root.name = "Body"
	add_child(_body_root)
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.48
	body_mesh.height = 1.35
	body_mesh.radial_segments = 64
	body_mesh.rings = 24
	var body_surface := PlushSurfaceBuilderScript.create_surface(
		"BodySurface", body_mesh, Vector3(0.92, 1.0, 0.78), BODY_COLOR, 32, 0.035
	)
	body_surface.position.y = -0.46
	_body_root.add_child(body_surface)
	_cap = MushroomCapBuilderScript.create(AppearanceSettingsScript.default_color())
	_body_root.add_child(_cap)
	_build_face()
	_build_limbs()

func _build_face() -> void:
	var face := _sphere("Face", 0.66, FACE_COLOR, 0.94)
	face.position = Vector3(0.0, 0.03, 0.65)
	face.scale = Vector3(1.0, 0.43, 0.28)
	_body_root.add_child(face)
	_eyes_root = Node3D.new()
	_eyes_root.name = "Eyes"
	_body_root.add_child(_eyes_root)
	_create_bead_eye("Left", Vector3(-0.18, 0.08, 0.84))
	_create_bead_eye("Right", Vector3(0.18, 0.08, 0.84))
	_add_blush("LeftCheek", Vector3(-0.39, -0.07, 0.82))
	_add_blush("RightCheek", Vector3(0.39, -0.07, 0.82))
	_add_smile()

func _build_limbs() -> void:
	_add_limb("LeftArm", Vector3(-0.52, -0.48, 0.04), Vector3(0.16, 0.30, 0.18), 24.0)
	_add_limb("RightArm", Vector3(0.52, -0.48, 0.04), Vector3(0.16, 0.30, 0.18), -24.0)
	_add_limb("LeftFoot", Vector3(-0.27, -1.08, 0.14), Vector3(0.25, 0.17, 0.30), 0.0)
	_add_limb("RightFoot", Vector3(0.27, -1.08, 0.14), Vector3(0.25, 0.17, 0.30), 0.0)
```

珠眼为半径 0.07 的黑色高光球；嘴由两段半径 0.012、高度 0.10 的深棕圆柱组成；腮红为透明粉色扁球；手脚为奶油色扁球。`set_body_pose` 只缩放和移动 `Body`，所有外观部件因此同步运动。

- [ ] **步骤 6：调整窗口、命中区域、相机和阴影**

```gdscript
const WINDOW_SIZE := Vector2i(300, 330)
const RENDER_SIZE := Vector2i(600, 660)
const FUR_SHELL_COUNT := 32
const FUR_LENGTH := 0.04
```

```gdscript
var size := Vector2(PetConfigScript.WINDOW_SIZE)
_window.mouse_passthrough_polygon = WindowGeometryScript.ellipse_polygon(
	PetConfigScript.WINDOW_SIZE,
	Vector2(size.x * 0.5, size.y * 0.52),
	Vector2(size.x * 0.46, size.y * 0.46),
	32,
)
```

相机移到 `Vector3(0, 0, 4.5)`，视角设为 35 度；阴影中心移到 `Vector3(0, -1.15, -0.32)`，尺寸改为 `Vector2(1.55, 0.40)`。

- [ ] **步骤 7：运行编辑器检查和完整测试**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

- [ ] **步骤 8：提交可运行的默认紫色蘑菇桌宠**

```bash
git add project.godot scripts shaders tests
git commit -m "重构：实现高还原紫色蘑菇桌宠"
```

### 任务三：右键换色菜单与颜色记忆

**文件：**

- 修改：`scripts/pet/pet_interaction.gd`
- 修改：`scripts/main.gd`
- 修改：`tests/test_animation_math.gd`
- 修改：`tests/test_main_scene.gd`

**接口：**

- 修改：`PetInteraction.setup(window_controller, animator, visual, settings_path := AppearanceSettings.SETTINGS_PATH)`
- 右键：打开 `ColorMenu`，不再直接退出。
- 菜单编号 0 至 5：六种帽色；编号 100：退出。

- [ ] **步骤 1：编写失败测试**

```gdscript
var interaction := PetInteractionScript.new()
interaction.setup(window_controller, animator, visual, "user://mushroom_pet_interaction_test.cfg")
var menu := interaction.get_node_or_null("ColorMenu") as PopupMenu
if menu == null or menu.item_count != 8:
	errors.append("右键菜单必须包含六种颜色、分隔线和退出")
else:
	menu.id_pressed.emit(1)
	var cap_material := (visual.get_node("Body/MushroomCap/Top/FurShells/Shell00") as MeshInstance3D).material_override
	if cap_material.get_shader_parameter("fur_color") != Color("ef7f45"):
		errors.append("颜色菜单必须立即更新蘑菇帽")
```

删除“右键必须退出”的旧断言，改为断言右键负责显示颜色菜单；左键拖拽断言保持不变。

- [ ] **步骤 2：运行测试并确认失败**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

- [ ] **步骤 3：实现菜单与持久化**

```gdscript
const EXIT_MENU_ID := 100

func setup(window_controller, animator: Node, visual: Node3D = null, settings_path := AppearanceSettingsScript.SETTINGS_PATH) -> void:
	_window_controller = window_controller
	_animator = animator
	_visual = visual
	_settings_path = settings_path
	_color_menu = PopupMenu.new()
	_color_menu.name = "ColorMenu"
	for index in AppearanceSettingsScript.presets().size():
		_color_menu.add_item(AppearanceSettingsScript.presets()[index].label, index)
	_color_menu.add_separator()
	_color_menu.add_item("退出", EXIT_MENU_ID)
	_color_menu.id_pressed.connect(_on_menu_id_pressed)
	add_child(_color_menu)
	if _visual != null:
		_visual.set_cap_color(AppearanceSettingsScript.load_cap_color(_settings_path))
	set_process(true)
	set_process_input(true)

func _on_menu_id_pressed(id: int) -> void:
	if id == EXIT_MENU_ID:
		get_tree().quit(0)
		return
	var presets := AppearanceSettingsScript.presets()
	if id < 0 or id >= presets.size() or _visual == null:
		return
	var color: Color = presets[id].color
	_visual.set_cap_color(color)
	AppearanceSettingsScript.save_cap_color(color, _settings_path)
```

右键分支设置菜单屏幕位置并调用 `_color_menu.popup()`，不再直接退出。

- [ ] **步骤 4：更新主场景接线并运行完整测试**

```gdscript
interaction.setup(window_controller, animator, visual)
```

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

- [ ] **步骤 5：提交完整用户换色流程**

```bash
git add scripts/main.gd scripts/pet/pet_interaction.gd tests/test_animation_math.gd tests/test_main_scene.gd
git commit -m "功能：增加蘑菇帽右键换色菜单"
```

### 任务四：视觉校准、交付与文档

**文件：**

- 修改：`README.md`
- 修改：`artifacts/desktop-pet.png`
- 必要时修改任务二中的视觉参数文件，但不得改变已确认功能范围。

- [ ] **步骤 1：录制透明背景画面并检查**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path . --write-movie /tmp/mushroom_pet.png --fixed-fps 60 --quit-after 5
```

检查最后一帧：帽子不裁切、帽宽明显大于身体、五个白斑可见、脸不被帽檐遮挡、手脚可辨认、短绒边缘稳定。若不满足，只调整几何位置、缩放、颜色、灯光或相机参数，并重新运行完整测试。

- [ ] **步骤 2：更新预览图和说明**

使用以下命令将最后一帧铺到白色 400 × 440 画布，并更新说明文档为蘑菇造型、右键换色、颜色记忆和新窗口尺寸：

```bash
sips -s format jpeg /tmp/mushroom_pet00000004.png --out /tmp/mushroom_pet_flat.jpg
sips --resampleWidth 360 /tmp/mushroom_pet_flat.jpg --out /tmp/mushroom_pet_resized.jpg
sips --padToHeightWidth 440 400 --padColor FFFFFF /tmp/mushroom_pet_resized.jpg --out /tmp/mushroom_pet_padded.jpg
sips -s format png /tmp/mushroom_pet_padded.jpg --out artifacts/desktop-pet.png
```

- [ ] **步骤 3：执行最终验证与导出**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
./scripts/export.command
./tests/test_export_app.command
git diff --check
```

- [ ] **步骤 4：启动成品并确认进程稳定**

```bash
build/毛球桌宠.app/Contents/MacOS/毛球桌宠
```

确认启动日志无错误且进程持续运行。

- [ ] **步骤 5：提交最终交付**

```bash
git add README.md artifacts/desktop-pet.png
git commit -m "交付：完成蘑菇桌宠视觉校准与成品更新"
```
