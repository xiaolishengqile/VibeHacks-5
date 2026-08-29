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
	var peek_toggle := visual.get_node("PeekToggle") as Button
	peek_toggle.pressed.emit()
	if not visual.is_peek_mode():
		errors.append("手动按钮必须能进入探头状态")
	var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
	if window.position.x + window.size.x != usable.end.x:
		errors.append("手动进入探头状态时必须贴紧桌面右侧")
	peek_toggle.pressed.emit()
	if visual.is_peek_mode():
		errors.append("手动按钮必须能退出探头状态")
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

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors
