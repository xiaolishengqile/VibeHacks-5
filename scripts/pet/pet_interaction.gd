class_name PetInteraction
extends Node

const PetHoverMenuScript = preload("res://scripts/pet/pet_hover_menu.gd")

signal open_panel_requested
signal quit_requested
signal menu_action_requested(event_type: String)

const CLICK_THRESHOLD := 4.0

var _window_controller
var _animator: Node
var _integrated_mode := false
var _left_pressed := false
var _drag_started := false
var _press_position := Vector2.ZERO
var _hover_menu


func setup(window_controller, animator: Node, integrated_mode: bool = false) -> void:
	_window_controller = window_controller
	_animator = animator
	_integrated_mode = integrated_mode
	_hover_menu = PetHoverMenuScript.new()
	_hover_menu.name = "PetHoverMenu"
	_hover_menu.action_requested.connect(_on_menu_button_pressed)
	add_child(_hover_menu)
	_hover_menu.setup()
	set_process(true)
	set_process_input(true)


static func menu_buttons() -> Array[Dictionary]:
	return PetHoverMenuScript.buttons()


static func menu_button_rects(pet_position: Vector2i, work_area: Rect2i) -> Array[Rect2i]:
	return PetHoverMenuScript.button_rects(pet_position, work_area)


static func menu_visible_after_pet_click(menu_visible: bool, clicked: bool) -> bool:
	return not menu_visible if clicked else menu_visible


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
			_set_menu_visible(menu_visible_after_pet_click(_hover_menu.is_menu_visible(), true))
		_left_pressed = false
	_animator.react()


func _process(_delta: float) -> void:
	if _window_controller == null or _animator == null:
		return
	if _left_pressed and not is_click(_press_position, Vector2(DisplayServer.mouse_get_position())):
		_drag_started = true
	_window_controller.update_drag()
	var local_mouse := _local_mouse_position()
	_animator.set_mouse_position(local_mouse)
	_hover_menu.update_for_pet_window(get_window())
	if _window_controller.is_dragging():
		_set_menu_visible(false)


func _on_menu_button_pressed(event_type: String) -> void:
	if event_type == "hide_pet":
		_window_controller.tuck_to_edge()
	if _integrated_mode:
		menu_action_requested.emit(event_type)
	elif event_type in ["open_today", "open_input"]:
		open_panel_requested.emit()
	_set_menu_visible(false)


func _set_menu_visible(visible: bool) -> void:
	if _hover_menu == null or _hover_menu.is_menu_visible() == visible:
		return
	if visible:
		_window_controller.restore_from_tucked()
		_hover_menu.update_for_pet_window(get_window())
	_hover_menu.set_menu_visible(visible)
	_window_controller.set_menu_expanded(false)


func _local_mouse_position() -> Vector2:
	return Vector2(DisplayServer.mouse_get_position() - get_window().position)
