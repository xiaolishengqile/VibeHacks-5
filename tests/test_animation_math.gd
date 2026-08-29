extends RefCounted

const PetAnimatorScript = preload("res://scripts/pet/pet_animator.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var viewport := Vector2(240, 210)
	if not PetAnimatorScript.gaze_offset(viewport * 0.5, viewport).is_zero_approx():
		errors.append("鼠标位于窗口中心时视线偏移必须为零")
	var clamped_gaze := PetAnimatorScript.gaze_offset(Vector2(960, -420), viewport)
	if not clamped_gaze.is_equal_approx(Vector2(0.07, -0.07)):
		errors.append("视线偏移必须限制在 0.07 范围内")
	if not is_equal_approx(PetAnimatorScript.blink_openness(0.5), 0.0):
		errors.append("眨眼中点必须完全闭合")
	if not is_equal_approx(PetAnimatorScript.blink_openness(-0.1), 1.0):
		errors.append("眨眼周期外必须完全睁开")
	if not PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_RIGHT, true):
		errors.append("右键按下必须请求退出")
	if PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_LEFT, true):
		errors.append("左键不能请求退出")

	var visual := PetVisualScript.new()
	visual.build()
	var animator := PetAnimatorScript.new()
	animator.setup(visual)
	animator.set_mouse_position(Vector2(120, 105))
	animator.react()

	var window := Window.new()
	var window_controller = DesktopWindowControllerScript.new()
	window_controller.configure(window)
	var interaction := PetInteractionScript.new()
	interaction.setup(window_controller, animator)
	var opened_panel := false
	interaction.open_panel_requested.connect(func(): opened_panel = true)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	interaction._input(press)
	if not window_controller.is_dragging():
		errors.append("左键按下必须开始拖拽")
	press.pressed = false
	interaction._input(press)
	if window_controller.is_dragging():
		errors.append("左键松开必须结束拖拽")
	if opened_panel:
		errors.append("单击桌宠不能再直接打开轻面板")
	var menu = interaction.get_node("PetHoverMenu")
	var menu_window_count := 0
	var menu_fill_colors: Array[Color] = []
	var menu_border_colors: Array[Color] = []
	for child in menu.get_children():
		if child is Window:
			menu_window_count += 1
			if child.unfocusable:
				errors.append("菜单按钮窗口必须可交互，点击按钮才能触发入口")
			if child.get_child_count() == 0:
				errors.append("菜单按钮窗口必须包含可点击按钮")
			else:
				var button := child.get_child(0) as Button
				if button == null:
					errors.append("菜单按钮窗口必须包含可点击按钮")
					continue
				var style := button.get_theme_stylebox("normal") as StyleBoxFlat
				if style == null:
					errors.append("菜单按钮必须有明确的默认样式")
				else:
					menu_fill_colors.append(style.bg_color)
					menu_border_colors.append(style.border_color)
	if menu_window_count != 4:
		errors.append("桌宠菜单必须创建四个独立按钮窗口")
	if _unique_color_count(menu_fill_colors) != 4:
		errors.append("四个菜单按钮必须用不同背景色区分功能")
	if _unique_color_count(menu_border_colors) != 4:
		errors.append("四个菜单按钮必须用不同边框色区分功能")
	if not menu.is_menu_visible():
		errors.append("单击桌宠必须显示四个菜单按钮")
	press.pressed = true
	interaction._input(press)
	press.pressed = false
	interaction._input(press)
	if menu.is_menu_visible():
		errors.append("再次单击桌宠必须收起四个菜单按钮")
	interaction._on_menu_button_pressed("hide_pet")
	var tucked := DesktopWindowControllerScript.tucked_position(
		DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen()),
		window.size,
	)
	if window.position != tucked:
		errors.append("隐藏按钮必须把桌宠收纳到屏幕边缘")

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors


static func _unique_color_count(colors: Array[Color]) -> int:
	var unique: Array[Color] = []
	for color in colors:
		if not unique.has(color):
			unique.append(color)
	return unique.size()
