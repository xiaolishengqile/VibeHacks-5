class_name PetInteraction
extends Node

signal open_panel_requested
signal quit_requested

const CLICK_THRESHOLD := 4.0

var _window_controller
var _animator: Node
var _integrated_mode := false
var _left_pressed := false
var _drag_started := false
var _press_position := Vector2.ZERO


func setup(window_controller, animator: Node, integrated_mode: bool = false) -> void:
	_window_controller = window_controller
	_animator = animator
	_integrated_mode = integrated_mode
	set_process(true)
	set_process_input(true)


static func should_quit_for_button(button_index: MouseButton, pressed: bool) -> bool:
	return button_index == MOUSE_BUTTON_RIGHT and pressed


static func is_click(press_position: Vector2, release_position: Vector2, threshold: float = CLICK_THRESHOLD) -> bool:
	return press_position.distance_to(release_position) <= threshold


func _input(event: InputEvent) -> void:
	if not event is InputEventMouseButton:
		return
	if should_quit_for_button(event.button_index, event.pressed):
		if _integrated_mode:
			quit_requested.emit()
		else:
			get_tree().quit(0)
		return
	if event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_left_pressed = true
		_drag_started = false
		_press_position = Vector2(DisplayServer.mouse_get_position())
		_window_controller.begin_drag()
	else:
		var release_position := Vector2(DisplayServer.mouse_get_position())
		_window_controller.end_drag()
		if _left_pressed and not _drag_started and is_click(_press_position, release_position):
			open_panel_requested.emit()
		_left_pressed = false
	_animator.react()


func _process(_delta: float) -> void:
	if _window_controller == null or _animator == null:
		return
	if _left_pressed and not is_click(_press_position, Vector2(DisplayServer.mouse_get_position())):
		_drag_started = true
	_window_controller.update_drag()
	var local_mouse := DisplayServer.mouse_get_position() - get_window().position
	_animator.set_mouse_position(Vector2(local_mouse))
