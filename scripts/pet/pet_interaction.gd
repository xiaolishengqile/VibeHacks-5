class_name PetInteraction
extends Node

const PetHoverMenuScript = preload("res://scripts/pet/pet_hover_menu.gd")

signal open_panel_requested
signal quit_requested
signal menu_action_requested(event_type: String)

const CLICK_THRESHOLD := 4.0

var _window_controller
var _animator: Node
var _visual: Node
var _integrated_mode := false
var _left_pressed := false
var _drag_started := false
var _press_position := Vector2.ZERO
var _hover_menu


func setup(window_controller, animator: Node, visual: Node, integrated_mode: bool = false, pet_window: Window = null) -> void:
	_window_controller = window_controller
	_animator = animator
	_visual = visual
	_integrated_mode = integrated_mode
	_hover_menu = PetHoverMenuScript.new()
	_hover_menu.name = "PetHoverMenu"
	_hover_menu.action_requested.connect(_on_menu_button_pressed)
	_hover_menu.focus_moved.connect(_on_focus_moved)
	add_child(_hover_menu)
	_hover_menu.setup()
	if pet_window != null:
		pet_window.focus_exited.connect(_on_focus_moved)
	set_process(true)
	set_process_unhandled_input(true)
	_visual.peek_toggle_requested.connect(toggle_peek_mode)


static func menu_buttons() -> Array[Dictionary]:
	return PetHoverMenuScript.buttons()


static func menu_button_rects(pet_position: Vector2i, work_area: Rect2i) -> Array[Rect2i]:
	return PetHoverMenuScript.button_rects(pet_position, work_area)


static func menu_visible_after_pet_click(menu_visible: bool, clicked: bool) -> bool:
	return not menu_visible if clicked else menu_visible


static func should_hide_menu_for_pointer(global_position: Vector2i, pet_rect: Rect2i, menu_rects: Array[Rect2i]) -> bool:
	if pet_rect.has_point(global_position):
		return false
	for rect in menu_rects:
		if rect.has_point(global_position):
			return false
	return true


static func should_quit_for_button(button_index: MouseButton, pressed: bool) -> bool:
	return button_index == MOUSE_BUTTON_RIGHT and pressed


static func is_click(press_position: Vector2, release_position: Vector2, threshold: float = CLICK_THRESHOLD) -> bool:
	return press_position.distance_to(release_position) <= threshold


static func click_threshold_for_scale(screen_scale: float) -> float:
	return CLICK_THRESHOLD * maxf(screen_scale, 1.0)


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
		var should_peek: bool = _window_controller.is_near_right_edge()
		_window_controller.end_drag()
		_apply_peek_mode(should_peek)
		if should_peek:
			_window_controller.snap_to_right_edge()
		if _left_pressed and not _drag_started and is_click(
			_press_position,
			release_position,
			_current_click_threshold(),
		):
			_set_menu_visible(menu_visible_after_pet_click(_hover_menu.is_menu_visible(), true))
		_left_pressed = false
	_animator.react()


func toggle_peek_mode() -> void:
	if _visual == null:
		return
	var enabled: bool = not _visual.is_peek_mode()
	if enabled:
		_window_controller.snap_to_right_edge()
	_apply_peek_mode(enabled)


func _sync_edge_peek_mode() -> void:
	if _visual != null:
		_apply_peek_mode(_window_controller.is_near_right_edge())


func _apply_peek_mode(enabled: bool) -> void:
	_visual.set_peek_mode(enabled)
	_window_controller.set_peek_input_region(enabled)


func _current_click_threshold() -> float:
	var screen := DisplayServer.window_get_current_screen()
	return click_threshold_for_scale(DisplayServer.screen_get_scale(screen))


func _process(_delta: float) -> void:
	if _window_controller == null or _animator == null:
		return
	if _left_pressed and not is_click(
		_press_position,
		Vector2(DisplayServer.mouse_get_position()),
		_current_click_threshold(),
	):
		_drag_started = true
	_window_controller.update_drag()
	_hover_menu.update_for_pet_window(get_window())
	if _window_controller.is_dragging():
		_sync_edge_peek_mode()
		_set_menu_visible(false)


func _on_menu_button_pressed(event_type: String) -> void:
	if event_type == "hide_pet":
		_apply_peek_mode(false)
		_window_controller.tuck_to_edge()
	if _integrated_mode:
		menu_action_requested.emit(event_type)
	elif event_type in ["open_today", "open_input"]:
		open_panel_requested.emit()
	_set_menu_visible(false)


func _on_focus_moved() -> void:
	call_deferred("_hide_menu_if_pointer_left_targets")


func _hide_menu_if_pointer_left_targets() -> void:
	if _hover_menu == null or not _hover_menu.is_menu_visible():
		return
	if should_hide_menu_for_pointer(
		DisplayServer.mouse_get_position(),
		_window_controller.window_rect(),
		_hover_menu.global_button_rects(),
	):
		_set_menu_visible(false)


func _set_menu_visible(visible: bool) -> void:
	if _hover_menu == null or _hover_menu.is_menu_visible() == visible:
		return
	if visible:
		_window_controller.restore_from_tucked()
		_hover_menu.update_for_pet_window(get_window())
	_hover_menu.set_menu_visible(visible)
	_window_controller.set_menu_expanded(visible)
