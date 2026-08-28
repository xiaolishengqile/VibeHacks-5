class_name PetInteraction
extends Node

var _window_controller
var _animator: Node


func setup(window_controller, animator: Node) -> void:
	_window_controller = window_controller
	_animator = animator
	set_process(true)
	set_process_input(true)


static func should_quit_for_button(button_index: MouseButton, pressed: bool) -> bool:
	return button_index == MOUSE_BUTTON_RIGHT and pressed


func _input(event: InputEvent) -> void:
	if not event is InputEventMouseButton:
		return
	if should_quit_for_button(event.button_index, event.pressed):
		get_tree().quit(0)
		return
	if event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_window_controller.begin_drag()
	else:
		_window_controller.end_drag()
	_animator.react()


func _process(_delta: float) -> void:
	if _window_controller == null or _animator == null:
		return
	_window_controller.update_drag()
	var local_mouse := DisplayServer.mouse_get_position() - get_window().position
	_animator.set_mouse_position(Vector2(local_mouse))
