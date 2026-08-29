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
	interaction.setup(window_controller, animator, visual, true, window)
	var peek_toggle := visual.get_node("PeekToggle") as Button
	peek_toggle.pressed.emit()
	if not visual.is_peek_mode():
		errors.append("手动按钮必须能进入探头状态")
	var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
	if window.position.x + window.size.x != usable.end.x:
		errors.append("手动进入探头状态时必须贴紧桌面右侧")
	window_controller.restore_from_tucked()
	peek_toggle.pressed.emit()
	if visual.is_peek_mode():
		errors.append("手动按钮必须能退出探头状态")
	var opened_panel := false
	var requested_actions: Array[String] = []
	interaction.open_panel_requested.connect(func(): opened_panel = true)
	interaction.menu_action_requested.connect(func(event_type: String): requested_actions.append(event_type))
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
		errors.append("单击桌宠不能走旧的统一轻面板入口")
	if not requested_actions.is_empty():
		errors.append("单击桌宠不能立刻触发今日任务，必须给双击留出取消窗口")
	if interaction.has_node("PetHoverMenu") and interaction.get_node("PetHoverMenu").is_menu_visible():
		errors.append("单击桌宠进入今日任务前必须先收起四个菜单按钮")
	interaction._complete_pending_single_click()
	if requested_actions != ["open_today"]:
		errors.append("单击桌宠必须在双击窗口结束后请求今日任务")

	requested_actions.clear()
	interaction._set_menu_visible(true)
	press.double_click = true
	press.pressed = true
	interaction._unhandled_input(press)
	press.pressed = false
	interaction._unhandled_input(press)
	interaction._complete_pending_single_click()
	if requested_actions != ["open_input"]:
		errors.append("双击桌宠必须取消单击今日任务并直接请求输入状态")
	if interaction.has_node("PetHoverMenu") and interaction.get_node("PetHoverMenu").is_menu_visible():
		errors.append("双击桌宠进入输入状态后必须收起四个菜单按钮")

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors
