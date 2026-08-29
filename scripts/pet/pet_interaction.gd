class_name PetInteraction
extends Node

signal open_panel_requested
signal quit_requested

const CLICK_THRESHOLD := 4.0

var _window_controller
var _animator: Node
var _visual: Node
var _integrated_mode := false
var _left_pressed := false
var _drag_started := false
var _press_position := Vector2.ZERO


func setup(window_controller, animator: Node, visual: Node, integrated_mode: bool = false) -> void:
	_window_controller = window_controller
	_animator = animator
	_visual = visual
	_integrated_mode = integrated_mode
	set_process(true)
	set_process_unhandled_input(true)
	_visual.peek_toggle_requested.connect(toggle_peek_mode)


static func should_quit_for_button(button_index: MouseButton, pressed: bool) -> bool:
	return button_index == MOUSE_BUTTON_RIGHT and pressed


static func is_click(press_position: Vector2, release_position: Vector2, threshold: float = CLICK_THRESHOLD) -> bool:
	return press_position.distance_to(release_position) <= threshold


func _unhandled_input(event: InputEvent) -> void:
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
		_window_controller.update_drag()
		_sync_edge_peek_mode()
		_window_controller.end_drag()
		if _left_pressed and not _drag_started and is_click(_press_position, release_position):
			open_panel_requested.emit()
		_left_pressed = false
	_animator.react()


func toggle_peek_mode() -> void:
	if _visual == null:
		return
	var enabled: bool = not _visual.is_peek_mode()
	if enabled:
		_window_controller.snap_to_right_edge()
	_visual.set_peek_mode(enabled)


func _sync_edge_peek_mode() -> void:
	if _visual != null:
		_visual.set_peek_mode(_window_controller.is_near_right_edge())


func _process(_delta: float) -> void:
	if _window_controller == null or _animator == null:
		return
	if _left_pressed and not is_click(_press_position, Vector2(DisplayServer.mouse_get_position())):
		_drag_started = true
	_window_controller.update_drag()
	if _window_controller.is_dragging():
		_sync_edge_peek_mode()
