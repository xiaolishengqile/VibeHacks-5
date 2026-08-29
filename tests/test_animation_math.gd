extends RefCounted

const PetAnimatorScript = preload("res://scripts/pet/pet_animator.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	if not PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_RIGHT, true):
		errors.append("右键按下必须请求退出")
	if PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_LEFT, true):
		errors.append("左键不能请求退出")
	if not is_equal_approx(PetInteractionScript.click_threshold_for_scale(2.0), 8.0):
		errors.append("二倍高分屏的点击容差必须同步放大")

	var visual := PetVisualScript.new()
	visual.build()
	var animator := PetAnimatorScript.new()
	animator.setup(visual)
	animator.react()

	var window := Window.new()
	var window_controller = DesktopWindowControllerScript.new()
	window_controller.configure(window)
	var interaction := PetInteractionScript.new()
	interaction.setup(window_controller, animator, visual)
	var menu = interaction.get_node("PetHoverMenu")
	var peek_toggle := visual.get_node("PeekToggle") as Button
	peek_toggle.pressed.emit()
	if not visual.is_peek_mode():
		errors.append("手动按钮必须能进入探头状态")
	var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
	if window.position.x + window.size.x != usable.end.x:
		errors.append("手动进入探头状态时必须贴紧桌面右侧")
	menu.action_requested.emit("hide_pet")
	if visual.is_peek_mode():
		errors.append("探头状态隐藏前必须恢复完整立绘，保留可见唤回区域")
	window_controller.restore_from_tucked()
	peek_toggle.pressed.emit()
	peek_toggle.pressed.emit()
	if visual.is_peek_mode():
		errors.append("手动按钮必须能退出探头状态")
	var opened_panel := false
	interaction.open_panel_requested.connect(func(): opened_panel = true)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	interaction._unhandled_input(press)
	if not window_controller.is_dragging():
		errors.append("左键按下必须开始拖拽")
	press.pressed = false
	interaction._unhandled_input(press)
	if window_controller.is_dragging():
		errors.append("左键松开必须结束拖拽")
	if opened_panel:
		errors.append("单击桌宠不能再直接打开轻面板")
	var menu_window_count := 0
	for child in menu.get_children():
		if child is Window:
			menu_window_count += 1
			if child.unfocusable:
				errors.append("菜单按钮窗口必须可交互，点击按钮才能触发入口")
	if menu_window_count != 4:
		errors.append("桌宠菜单必须创建四个独立按钮窗口")
	if not menu.is_menu_visible():
		errors.append("单击桌宠必须显示四个菜单按钮")
	press.pressed = true
	interaction._unhandled_input(press)
	press.pressed = false
	interaction._unhandled_input(press)
	if menu.is_menu_visible():
		errors.append("再次单击桌宠必须收起四个菜单按钮")

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors
