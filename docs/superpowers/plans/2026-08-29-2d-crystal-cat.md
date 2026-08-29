# 2D Crystal Cat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active 3D green fur pet with the approved pastel 2D crystal cat while preserving desktop interaction.

**Architecture:** Keep the existing window controller, bridge, state mapping, and interaction boundaries. Replace only the Godot visual path with a `Node2D` scene, one sprite, one chroma-key canvas shader, and whole-sprite animation.

**Tech Stack:** Godot 4.7, GDScript, CanvasItem shader, PNG sprite, macOS export

**Spec:** `docs/superpowers/specs/2026-08-29-2d-crystal-cat-design.md`

## Global Constraints

- Preserve drag, click reaction, integrated panel opening, task status reactions, and right-click exit.
- Use a 120 × 120 window and 900 × 900 internal render surface.
- Do not retain active 3D cameras, lights, meshes, fur shells, eyelids, or gaze behavior.
- Use the approved cat, crown, tail, and complete ice platform as one 2D sprite.

---

### Task 1: Specify the 2D visual contract

**Files:**
- Modify: `tests/test_config.gd`
- Modify: `tests/test_window_geometry.gd`
- Modify: `tests/test_pet_visual.gd`
- Modify: `tests/test_animation_math.gd`
- Modify: `tests/test_main_scene.gd`

**Interfaces:**
- Consumes: existing Godot test runner and desktop interaction classes
- Produces: executable expectations for a square 2D sprite, whole-body pose, and 2D scene

- [ ] **Step 1: Write the failing tests**

  Assert `WINDOW_SIZE == Vector2i(120, 120)`, `RENDER_SIZE == Vector2i(900, 900)`, a `Node2D` main scene, a `Body/Artwork` `Sprite2D`, a canvas shader material, and a `set_body_pose(Vector2, float)` result. Remove assertions for fur shells, 3D eye parts, gaze, blink, and 3D shadows.

- [ ] **Step 2: Run the Godot suite and verify RED**

  Run: `/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd`

  Expected: failures report the old 285 × 250 window, missing 2D artwork, and old `Node3D` scene.

### Task 2: Implement the minimal 2D rendering path

**Files:**
- Create: `assets/pet/crystal_cat_2d.png`
- Create: `shaders/chroma_key.gdshader`
- Modify: `scripts/config/pet_config.gd`
- Modify: `scripts/main.gd`
- Modify: `scripts/pet/pet_visual.gd`
- Modify: `scripts/pet/pet_animator.gd`
- Modify: `scripts/pet/pet_interaction.gd`
- Modify: `scripts/desktop/desktop_window_controller.gd`
- Modify: `scenes/main.tscn`
- Modify: `project.godot`

**Interfaces:**
- Consumes: `PetState.animation_parameters`, `DesktopWindowController`, `PetBridgeClient`
- Produces: `PetVisual.build()` and `PetVisual.set_body_pose(scale_factor: Vector2, y_offset: float)`

- [ ] **Step 1: Add the generated sprite and keying shader**

  Save the approved 1254 × 1254 image to `assets/pet/crystal_cat_2d.png`. The canvas shader computes green dominance and lowers alpha only for the uniform key background, with a smooth edge transition.

- [ ] **Step 2: Replace the visual implementation**

  Build one centered `Sprite2D` below a `Body` pivot. Scale it to `ARTWORK_SIZE := 870.0` inside the 900 × 900 render area and apply the shader material.

- [ ] **Step 3: Simplify animation and interaction**

  Keep breathing, floating, completion reaction, and status speed. Use `Vector2` scale and pixel offsets; remove blink timing, random state, gaze math, and mouse-position forwarding.

- [ ] **Step 4: Replace the scene and window configuration**

  Change the main scene root to `Node2D`, remove camera/light construction, and update the project viewport/window sizes. Update the click-through ellipse for the square artwork.

- [ ] **Step 5: Run the Godot suite and verify GREEN**

  Run: `/Applications/Godot.app/Contents/MacOS/Godot --headless --editor --path . --quit && /Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tests/run_tests.gd`

  Expected: `全部测试通过` with exit code 0.

### Task 3: Remove obsolete 3D production code and update product documentation

**Files:**
- Delete: `scripts/pet/fur_tuft_builder.gd`
- Delete: `scripts/pet/hat_builder.gd`
- Delete: `shaders/fur_shell.gdshader`
- Delete: `shaders/shadow.gdshader`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed 2D visual path
- Produces: a package without an active or referenced 3D pet implementation

- [ ] **Step 1: Delete unreferenced 3D builders and shaders**

  Remove the obsolete files after `rg` confirms that production code no longer references them.

- [ ] **Step 2: Update the README**

  Describe the 120 × 120 2D crystal cat, transparent keying, whole-body animation, right-edge peek mode, and preserved desktop interactions.

### Task 4: Verify, package, preview, and integrate

**Files:**
- Modify when generated: `artifacts/desktop-pet.png`

**Interfaces:**
- Consumes: completed 2D desktop pet
- Produces: verified app bundle, visual evidence, and one complete Chinese commit

- [ ] **Step 1: Run fresh verification**

  Run the Godot suite, `npm test`, `npm run typecheck`, `npm run build:desktop`, `./scripts/export.command`, and `./tests/test_export_app.command`.

- [ ] **Step 2: Launch and capture visual evidence**

  Start the exported app, capture the desktop-pet window, and verify transparent corners, complete silhouette, correct colors, and no chroma-green background.

- [ ] **Step 3: Commit the complete feature**

  Stage only files from this plan and commit with a Chinese message after all verification passes.

- [ ] **Step 4: Merge to main and verify again**

  Merge the feature branch locally into `main`, rerun the focused Godot and export checks, then remove only this owned worktree and feature branch.
