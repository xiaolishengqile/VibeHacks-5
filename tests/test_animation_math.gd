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

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors
