# Apple Silicon 3D Desktop Pet Implementation Plan
# 苹果芯片三维桌宠实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **供自动化执行者使用：** 必须使用“子代理驱动开发”或“执行计划”技能逐项实施本计划，并用复选框跟踪进度。

**Goal:** Build a visible, interactive, furry green 3D desktop pet that runs on the current Apple Silicon Mac.

**目标：** 制作一个能在当前苹果芯片电脑上运行、可见、可交互的绿色绒毛三维桌宠。

**Architecture:** Godot creates the model procedurally and owns both real-time rendering and the native transparent overlay window. Small controllers separate visual construction, animation, input, and desktop-window behavior; no external modeling tool or runtime dependency is used.

**架构：** 戈多引擎负责程序化模型、实时渲染和原生透明覆盖窗口。外观、动画、输入和桌面窗口分别由小型控制器负责，首版不引入外部建模工具或运行时依赖。

**Tech Stack:** Godot 4 stable, GDScript, Godot spatial shaders, macOS 15.6.1 on Apple Silicon.

**技术栈：** 戈多引擎 4 稳定版、戈多脚本、空间材质渲染器、苹果芯片上的苹果桌面系统 15.6.1。

**Spec:** `docs/superpowers/specs/2026-08-28-macos-3d-desktop-pet-design.md`

**设计依据：** `docs/superpowers/specs/2026-08-28-macos-3d-desktop-pet-design.md`

## Global Constraints
## 全局约束

- 只支持当前苹果芯片电脑，不增加跨平台分支。
- 窗口固定为 264 × 231 像素，内部以 528 × 462 渲染；窗口透明、无边框、不可缩放、始终置顶。
- 毛发使用 48 层短绒、128 × 64 身体网格、0.075 毛长、无缝真实绒毛材质和一万五千根独立细毛。
- 官方通用模板导出后必须裁剪为仅苹果芯片程序，并重新完成本地临时签名。
- 首版模型必须完全程序化生成，不安装三维建模工具。
- 必须具备呼吸、眨眼、轻微弹跳、视线跟随、拖拽和右键退出。
- 每个实现任务都必须先产生失败检查，再实现并通过检查。
- 每次提交使用中文提交信息，且提交内容必须处于可运行或可验证状态。

## File Map
## 文件结构

- `project.godot`：项目入口、透明窗口和渲染器配置。
- `.gitignore`：忽略引擎缓存、构建产物和运行日志。
- `scripts/config/pet_config.gd`：尺寸、颜色、毛发和动画常量。
- `scripts/desktop/window_geometry.gd`：可测试的鼠标命中区域计算。
- `scripts/desktop/desktop_window_controller.gd`：窗口透明、置顶、定位与拖拽。
- `scripts/pet/pet_visual.gd`：程序化创建身体、毛发、眼睛和阴影。
- `scripts/pet/pet_animator.gd`：呼吸、眨眼、弹跳和视线动画。
- `scripts/pet/pet_interaction.gd`：鼠标事件、拖拽与退出。
- `scripts/main.gd`：只负责组装各模块。
- `scenes/main.tscn`：最小主场景。
- `shaders/fur_shell.gdshader`：毛发壳层裁剪、颜色和摆动。
- `shaders/shadow.gdshader`：假阴影径向透明渐变。
- `tests/run_tests.gd`：无第三方依赖的测试入口。
- `tests/test_config.gd`：配置约束检查。
- `tests/test_window_geometry.gd`：命中区域计算检查。
- `tests/test_pet_visual.gd`：程序化场景结构检查。
- `tests/test_animation_math.gd`：视线和眨眼数学检查。
- `scripts/run.command`：一键启动项目。
- `scripts/export.command`：导出苹果应用包。
- `export_presets.cfg`：苹果应用导出配置。
- `README.md`：启动、拖拽、退出和验证说明。
- `artifacts/desktop-pet.png`：实际运行截图。

---

### Task 1: Bootstrap the tested Godot project
### 任务一：建立可测试的戈多项目

**Files:**

- Create: `.gitignore`
- Create: `project.godot`
- Create: `scripts/config/pet_config.gd`
- Create: `tests/run_tests.gd`
- Create: `tests/test_config.gd`

**Interfaces:**

- Produces: `PetConfig.WINDOW_SIZE: Vector2i`, `FUR_SHELL_COUNT: int`, `TARGET_FPS: int`, `BODY_COLOR: Color`.
- Produces: command-line test entry `res://tests/run_tests.gd`.

- [ ] **Step 1: Install the runtime and record the exact executable**

Run:

```bash
brew install --cask godot
/Applications/Godot.app/Contents/MacOS/Godot --version
```

Expected: a Godot 4 stable version and an executable at the stated path.

- [ ] **Step 2: Write the test runner and failing configuration test**

`tests/run_tests.gd`:

```gdscript
extends SceneTree

const TESTS := [
    preload("res://tests/test_config.gd"),
]

func _initialize() -> void:
    var errors: Array[String] = []
    for test_case in TESTS:
        errors.append_array(test_case.run())
    if errors.is_empty():
        print("全部测试通过")
        quit(0)
        return
    for error in errors:
        push_error(error)
    quit(1)
```

`tests/test_config.gd`:

```gdscript
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")

static func run() -> Array[String]:
    var errors: Array[String] = []
    if PetConfigScript.WINDOW_SIZE != Vector2i(264, 231):
        errors.append("窗口尺寸必须为 264 × 231")
    if PetConfigScript.FUR_SHELL_COUNT != 24:
        errors.append("默认毛发壳层必须为 48")
    if PetConfigScript.TARGET_FPS != 60:
        errors.append("目标帧率必须为 60")
    return errors
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
```

Expected: failure because `scripts/config/pet_config.gd` does not exist.

- [ ] **Step 4: Add the minimal project and configuration**

`scripts/config/pet_config.gd`:

```gdscript
class_name PetConfig
extends RefCounted

const WINDOW_SIZE := Vector2i(264, 231)
const FUR_SHELL_COUNT := 48
const FUR_LENGTH := 0.075
const FUR_RADIAL_SEGMENTS := 128
const FUR_RINGS := 64
const TARGET_FPS := 60
const BODY_COLOR := Color("b7cf58")
const BODY_SCALE := Vector3(1.28, 0.96, 1.0)
const WINDOW_MARGIN := Vector2i(24, 24)
```

`project.godot`:

```ini
; Engine configuration file.
config_version=5

[application]

config/name="毛球桌宠"

[display]

window/size/viewport_width=528
window/size/viewport_height=462
window/size/window_width_override=264
window/size/window_height_override=231
window/size/borderless=true
window/size/always_on_top=true
window/size/transparent=true
window/size/no_focus=true
window/size/resizable=false
window/per_pixel_transparency/allowed=true

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
viewport/transparent_background=true
environment/defaults/default_clear_color=Color(0, 0, 0, 0)
textures/vram_compression/import_etc2_astc=true
```

`.gitignore`:

```gitignore
.godot/
build/
*.log
.DS_Store
```

- [ ] **Step 5: Run the test and project parse checks**

Run:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
```

Expected: tests report `全部测试通过`; project parse exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add .gitignore project.godot scripts/config tests
git commit -m "工程：建立三维桌宠项目和基础测试"
```

### Task 2: Build the transparent desktop window controller
### 任务二：实现透明桌面窗口控制

**Files:**

- Create: `scripts/desktop/window_geometry.gd`
- Create: `scripts/desktop/desktop_window_controller.gd`
- Create: `tests/test_window_geometry.gd`
- Modify: `tests/run_tests.gd`

**Interfaces:**

- Consumes: `PetConfig.WINDOW_SIZE`, `PetConfig.WINDOW_MARGIN`.
- Produces: `WindowGeometry.ellipse_polygon(size: Vector2i, center: Vector2, radii: Vector2, point_count: int) -> PackedVector2Array`.
- Produces: `DesktopWindowController.configure(window: Window) -> void`, `begin_drag() -> void`, `update_drag() -> void`, `end_drag() -> void`.

- [ ] **Step 1: Write the failing geometry test**

Create a test that calls:

```gdscript
var polygon := WindowGeometryScript.ellipse_polygon(
    Vector2i(264, 231), Vector2(132, 126.5), Vector2(101.75, 79.75), 32
)
```

Assert that it contains 32 points, every point is inside the window, its first point is approximately `(212.5, 115)`, and opposite points are symmetric. Register the test in `tests/run_tests.gd`.

- [ ] **Step 2: Run the test and verify it fails**

Expected: failure because `window_geometry.gd` does not exist.

- [ ] **Step 3: Implement the geometry and window controller**

Use this exact ellipse calculation:

```gdscript
static func ellipse_polygon(
    size: Vector2i,
    center: Vector2,
    radii: Vector2,
    point_count: int = 32,
) -> PackedVector2Array:
    var points := PackedVector2Array()
    for index in point_count:
        var angle := TAU * float(index) / float(point_count)
        var point := center + Vector2(cos(angle) * radii.x, sin(angle) * radii.y)
        points.append(point.clamp(Vector2.ZERO, Vector2(size)))
    return points
```

`DesktopWindowController` uses the following implementation shape:

```gdscript
class_name DesktopWindowController
extends RefCounted

var _window: Window
var _dragging := false
var _drag_offset := Vector2i.ZERO

func configure(window: Window) -> void:
    _window = window
    _window.size = PetConfig.WINDOW_SIZE
    _window.borderless = true
    _window.transparent = true
    _window.transparent_bg = true
    _window.always_on_top = true
    _window.unresizable = true
    _window.unfocusable = true
    _window.mouse_passthrough_polygon = WindowGeometry.ellipse_polygon(
        PetConfig.WINDOW_SIZE, Vector2(132, 126.5), Vector2(101.75, 79.75), 32
    )
    var screen := DisplayServer.window_get_current_screen()
    var usable := DisplayServer.screen_get_usable_rect(screen)
    _window.position = usable.position + usable.size - _window.size - PetConfig.WINDOW_MARGIN

func begin_drag() -> void:
    _dragging = true
    _drag_offset = DisplayServer.mouse_get_position() - _window.position

func update_drag() -> void:
    if _dragging:
        _window.position = DisplayServer.mouse_get_position() - _drag_offset

func end_drag() -> void:
    _dragging = false
```

- [ ] **Step 4: Run tests and parse checks**

Expected: all tests pass and both scripts parse without warnings promoted to errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/desktop tests
git commit -m "功能：实现透明桌面窗口和拖拽区域"
```

### Task 3: Generate the furry pet appearance
### 任务三：生成绒毛桌宠外观

**Files:**

- Create: `shaders/fur_shell.gdshader`
- Create: `shaders/shadow.gdshader`
- Create: `scripts/pet/pet_visual.gd`
- Create: `tests/test_pet_visual.gd`
- Modify: `tests/run_tests.gd`

**Interfaces:**

- Consumes: `PetConfig.FUR_SHELL_COUNT`, `BODY_COLOR`, `BODY_SCALE`.
- Produces: `PetVisual.build() -> void`, `set_body_pose(scale_factor: Vector3, y_offset: float) -> void`, `set_blink(openness: float) -> void`, `set_gaze(offset: Vector2) -> void`, `set_shadow(strength: float) -> void`.

- [ ] **Step 1: Write the failing scene-structure test**

Instantiate `PetVisual`, call `build()`, and assert:

```gdscript
visual.get_node("Body/Base") != null
visual.get_node("Body/FurShells").get_child_count() == 48
visual.get_node("Eyes/Left") != null
visual.get_node("Eyes/Right") != null
visual.get_node("Shadow") != null
```

Register the test and verify it fails because `pet_visual.gd` does not exist.

- [ ] **Step 2: Implement the fur shader**

The shader must expand each shell along its normal, animate a very small sideways sway, derive repeatable noise from quantized ultraviolet coordinates, and discard more fragments toward outer layers:

```glsl
shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 fur_color : source_color = vec3(0.72, 0.82, 0.35);
uniform float shell_ratio : hint_range(0.0, 1.0) = 0.0;
uniform float fur_length : hint_range(0.0, 0.3) = 0.075;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void vertex() {
    VERTEX += NORMAL * fur_length * shell_ratio;
    VERTEX.x += sin(TIME * 1.4 + VERTEX.y * 7.0) * 0.008 * shell_ratio;
}

void fragment() {
    float strand = hash21(floor(UV * vec2(260.0, 180.0)));
    if (shell_ratio > 0.0 && strand < shell_ratio * 0.82) {
        discard;
    }
    ALBEDO = fur_color * mix(0.72, 1.08, strand);
    ROUGHNESS = 0.92;
}
```

- [ ] **Step 3: Implement the procedural visual hierarchy**

Create one compressed `SphereMesh` base, 48 shell instances sharing that mesh, and one material instance per shell with `shell_ratio = index / 47.0`:

```gdscript
func _build_body() -> void:
    body_root = Node3D.new()
    body_root.name = "Body"
    add_child(body_root)

    var body_mesh := SphereMesh.new()
    body_mesh.radius = 0.82
    body_mesh.height = 1.64
    body_mesh.radial_segments = PetConfig.FUR_RADIAL_SEGMENTS
    body_mesh.rings = PetConfig.FUR_RINGS

    var base := MeshInstance3D.new()
    base.name = "Base"
    base.mesh = body_mesh
    base.scale = PetConfig.BODY_SCALE
    base.material_override = _solid_material(PetConfig.BODY_COLOR.darkened(0.08))
    body_root.add_child(base)

    var shells := Node3D.new()
    shells.name = "FurShells"
    body_root.add_child(shells)
    for index in PetConfig.FUR_SHELL_COUNT:
        var shell := MeshInstance3D.new()
        shell.name = "Shell%02d" % index
        shell.mesh = body_mesh
        shell.scale = PetConfig.BODY_SCALE
        var material := ShaderMaterial.new()
        material.shader = FUR_SHADER
        material.set_shader_parameter(
            "shell_ratio", float(index) / float(PetConfig.FUR_SHELL_COUNT - 1)
        )
        material.set_shader_parameter("fur_color", PetConfig.BODY_COLOR)
        shell.material_override = material
        shells.add_child(shell)
```

Create each eye from a pale eye sphere of radius `0.235`, a green iris sphere of radius `0.145`, a black pupil sphere of radius `0.075`, a glossy transparent cornea sphere of radius `0.242`, and two white highlight spheres with radii `0.032` and `0.018`. Eye centers are `(-0.31, 0.14, 0.72)` and `(0.31, 0.14, 0.72)`. Create a back-facing ellipse at `(0, -0.73, -0.3)` with the shadow shader.

Store only the node references required by the four public pose methods. Keep all mesh-construction helpers private and under 40 lines each.

- [ ] **Step 4: Run tests and inspect shader imports**

Run the test entry and headless editor import. Expected: 48 dense fur shells, two eye groups, one shadow, no shader compile errors.

- [ ] **Step 5: Commit**

```bash
git add shaders scripts/pet/pet_visual.gd tests
git commit -m "功能：生成绒毛身体玻璃眼睛和桌面阴影"
```

### Task 4: Add animation and mouse interaction
### 任务四：增加动画和鼠标交互

**Files:**

- Create: `scripts/pet/pet_animator.gd`
- Create: `scripts/pet/pet_interaction.gd`
- Create: `tests/test_animation_math.gd`
- Modify: `tests/run_tests.gd`

**Interfaces:**

- Consumes: the four pose methods from `PetVisual` and drag methods from `DesktopWindowController`.
- Produces: `PetAnimator.setup(visual: PetVisual) -> void`, `react() -> void`, `set_mouse_position(position: Vector2) -> void`, `gaze_offset(mouse: Vector2, viewport: Vector2) -> Vector2`, `blink_openness(progress: float) -> float`.
- Produces: `PetInteraction.setup(window_controller: DesktopWindowController, animator: PetAnimator) -> void`.

- [ ] **Step 1: Write failing animation-math tests**

Test that a cursor at viewport center returns zero gaze, a far upper-right cursor clamps to the configured maximum, and `blink_openness(0.5)` returns the closed phase while values outside the blink interval return `1.0`.

- [ ] **Step 2: Run tests and verify failure**

Expected: failure because `pet_animator.gd` does not exist.

- [ ] **Step 3: Implement animation**

Use elapsed time to drive:

- breathing scale with `1.0 + sin(time * 2.0) * 0.025`;
- vertical idle motion with `sin(time * 1.5) * 0.025`;
- random blink intervals from 2.2 to 5.0 seconds, with a 0.16-second close/open cycle;
- a 0.35-second reaction bounce after drag release;
- gaze clamped to 0.07 model units on each axis.

Keep the pure math directly testable:

```gdscript
static func gaze_offset(mouse: Vector2, viewport: Vector2) -> Vector2:
    var normalized := (mouse - viewport * 0.5) / (viewport * 0.5)
    return normalized.clamp(Vector2(-1, -1), Vector2(1, 1)) * 0.07

static func blink_openness(progress: float) -> float:
    if progress < 0.0 or progress > 1.0:
        return 1.0
    return abs(progress * 2.0 - 1.0)
```

All visible changes must go through `PetVisual` pose methods; the animator must not create meshes or change window flags.

- [ ] **Step 4: Implement interaction**

Left-button press starts drag and calls `react()`. Mouse release ends drag and calls `react()` again. During `_process`, an active drag calls `update_drag()`. Right-button press calls `get_tree().quit(0)`. Mouse movement is read in screen coordinates and passed to the animator for gaze:

```gdscript
func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            window_controller.begin_drag()
        else:
            window_controller.end_drag()
        animator.react()
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
        get_tree().quit(0)

func _process(_delta: float) -> void:
    window_controller.update_drag()
    animator.set_mouse_position(Vector2(DisplayServer.mouse_get_position() - get_window().position))
```

- [ ] **Step 5: Run tests and parse checks**

Expected: all math tests pass; interaction and animator scripts parse with no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/pet tests
git commit -m "功能：增加呼吸眨眼视线跟随和拖拽互动"
```

### Task 5: Integrate and run the visible desktop pet
### 任务五：集成并运行可见桌宠

**Files:**

- Create: `scripts/main.gd`
- Create: `scenes/main.tscn`
- Create: `scripts/run.command`
- Create: `README.md`
- Modify: `tests/run_tests.gd`

**Interfaces:**

- Consumes: `DesktopWindowController`, `PetVisual`, `PetAnimator`, `PetInteraction`.
- Produces: runnable main scene and double-clickable launch command.

- [ ] **Step 1: Add a failing main-scene load test**

Load `res://scenes/main.tscn`, instantiate it, add it to a temporary root, wait one process frame, and assert nodes named `PetVisual`, `PetAnimator`, and `PetInteraction` exist.

- [ ] **Step 2: Verify the scene test fails**

Expected: failure because the scene and main script do not exist.

- [ ] **Step 3: Implement minimal composition**

`Main._ready()` must:

1. set `Engine.max_fps` from `PetConfig`;
2. configure the current window;
3. create and build `PetVisual`;
4. create and set up `PetAnimator`;
5. create and set up `PetInteraction`;
6. add one camera and two soft lights with fixed transforms.

The main script must contain no mesh-building, animation formulas, or input branching. Its composition is:

```gdscript
extends Node3D

func _ready() -> void:
    Engine.max_fps = PetConfig.TARGET_FPS
    var window_controller := DesktopWindowController.new()
    window_controller.configure(get_window())

    var visual := PetVisual.new()
    visual.name = "PetVisual"
    add_child(visual)
    visual.build()

    var animator := PetAnimator.new()
    animator.name = "PetAnimator"
    add_child(animator)
    animator.setup(visual)

    var interaction := PetInteraction.new()
    interaction.name = "PetInteraction"
    add_child(interaction)
    interaction.setup(window_controller, animator)

    _add_camera_and_lights()
```

`scenes/main.tscn` contains one `Node3D` with `scripts/main.gd`; add `run/main_scene="res://scenes/main.tscn"` to the `[application]` section of `project.godot`.

- [ ] **Step 4: Add one-click startup and concise usage documentation**

`scripts/run.command` must resolve its own directory, move to the repository root, and execute `/Applications/Godot.app/Contents/MacOS/Godot --path .`. Document left-drag, right-click exit, and the command-line fallback in `README.md`.

- [ ] **Step 5: Run automated checks and launch visibly**

Run:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
open scripts/run.command
```

Expected: automated checks pass and a transparent green furry pet appears at the lower-right of the desktop.

- [ ] **Step 6: Commit**

```bash
git add scripts scenes README.md tests project.godot
git commit -m "功能：集成并运行三维桌面宠物"
```

### Task 6: Export, capture, and verify the deliverable
### 任务六：导出截图并验证交付物

**Files:**

- Create: `export_presets.cfg`
- Create: `scripts/export.command`
- Create: `artifacts/desktop-pet.png`
- Modify: `README.md`

**Interfaces:**

- Consumes: complete runnable project.
- Produces: `build/毛球桌宠.app` and verified runtime screenshot.

- [ ] **Step 1: Add the export preset and export script**

Use the official universal template because current official template archives do not contain a standalone arm64 template binary. After export, thin the executable to arm64 and apply a new ad-hoc signature so the deliverable runs only on the current Apple Silicon computer.

`export_presets.cfg`:

```ini
[preset.0]

name="macOS"
platform="macOS"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/毛球桌宠.app"
patches=PackedStringArray()
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.0.options]

export/distribution_type=1
binary_format/architecture="universal"
binary_format/embed_pck=false
custom_template/debug=""
custom_template/release=""
application/bundle_identifier="com.vibehacks.fuzzypet"
codesign/codesign=1
notarization/notarization=0
```

The export script must create `build/`, export with the official template, thin the executable to arm64, and sign the final application:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --export-release "macOS" "build/毛球桌宠.app"
/usr/bin/lipo "build/毛球桌宠.app/Contents/MacOS/毛球桌宠" -thin arm64 -output "build/毛球桌宠.app/Contents/MacOS/毛球桌宠.arm64"
/usr/bin/codesign --force --deep --sign - "build/毛球桌宠.app"
```

- [ ] **Step 2: Install matching export templates and export**

Read the exact engine version from `Godot --version`, download the matching official export-template archive, install it into the versioned Godot export-template directory, then run `scripts/export.command`.

Expected: `build/毛球桌宠.app/Contents/MacOS/毛球桌宠` exists and is executable.

- [ ] **Step 3: Run the exported application and capture evidence**

Launch the executable while recording standard output, wait only until its window exists, capture the desktop to `artifacts/desktop-pet.png`, and inspect the image. Verify transparent background, green fur silhouette, two glass eyes, lower-right placement, and absence of a black rectangle.

- [ ] **Step 4: Verify interaction and logs**

Manually or through desktop automation verify left-drag changes the window position, gaze follows the cursor, a blink occurs within 5 seconds, the pet remains above a normal window, transparent pixels do not block clicks, and right-click exits. Confirm the runtime log contains no repeated errors.

- [ ] **Step 5: Run the final verification set**

```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd
/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit
test -x "build/毛球桌宠.app/Contents/MacOS/毛球桌宠"
./tests/test_export_app.command
git diff --check
git status --short
```

Expected: tests and parse checks pass, the exported executable exists, the only intended untracked or modified artifact is the newly captured screenshot before commit, and no whitespace errors exist.

- [ ] **Step 6: Document actual results and commit**

Update `README.md` with the verified engine version, application path, screenshot path, and actual interaction results.

```bash
git add export_presets.cfg scripts/export.command README.md artifacts/desktop-pet.png
git commit -m "交付：导出并验证苹果电脑桌宠应用"
```

## Completion Audit
## 完成审计

- The implementation is not complete until the exported application has been visibly launched on the current Mac.
- 只有当前苹果电脑实际启动过导出应用，实施才算完成。
- Automated tests prove configuration and scene structure; the screenshot and live interaction prove desktop-window behavior.
- 自动化测试证明配置与场景结构；截图和实时交互证明桌面窗口行为。
- Every requirement in the design spec maps to Tasks 2 through 6; excluded future features remain excluded.
- 设计方案中的每项要求都由任务二至任务六覆盖；明确排除的未来功能不进入本轮开发。
