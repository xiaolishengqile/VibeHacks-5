class_name PetInteraction
extends Node

const PetHoverMenuScript = preload("res://scripts/pet/pet_hover_menu.gd")

signal open_panel_requested
signal quit_requested
signal menu_action_requested(event_type: String)

const CLICK_THRESHOLD := 4.0
const SINGLE_CLICK_DELAY_SECONDS := 0.22
const MENU_POINTER_MARGIN := 18

var _window_controller
var _animator: Node
var _visual: Node
var _integrated_mode := false
var _left_pressed := false
var _press_was_double_click := false
var _drag_started := false
var _pending_single_click := false
var _press_position := Vector2.ZERO
var _hovering_pet := false
var _hover_menu
var _single_click_timer: Timer


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
	_single_click_timer = Timer.new()
	_single_click_timer.one_shot = true
	_single_click_timer.wait_time = SINGLE_CLICK_DELAY_SECONDS
	_single_click_timer.timeout.connect(_complete_pending_single_click)
	add_child(_single_click_timer)
	set_process(true)
	set_process_unhandled_input(true)
	_visual.peek_toggle_requested.connect(toggle_peek_mode)


static func menu_buttons() -> Array[Dictionary]:
	return PetHoverMenuScript.buttons()


static func hover_action_for_pointer(was_hovering: bool, global_position: Vector2i, pet_rect: Rect2i, dragging: bool) -> String:
	if dragging:
		return ""
	var hovering := pet_rect.has_point(global_position)
	if hovering and not was_hovering:
		return "show_menu"
	return ""


static func should_hide_menu_for_pointer(global_position: Vector2i, pet_rect: Rect2i, menu_rects: Array[Rect2i]) -> bool:
	var left := pet_rect.position.x
	var top := pet_rect.position.y
	var right := pet_rect.end.x
	var bottom := pet_rect.end.y
	for rect in menu_rects:
		left = mini(left, rect.position.x)
		top = mini(top, rect.position.y)
		right = maxi(right, rect.end.x)
		bottom = maxi(bottom, rect.end.y)
	var safe_rect := Rect2i(Vector2i(left, top), Vector2i(right - left, bottom - top))
	return not safe_rect.grow(MENU_POINTER_MARGIN).has_point(global_position)


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
		_press_was_double_click = event.double_click
		if _press_was_double_click:
			_cancel_pending_single_click()
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
			_set_menu_visible(false)
			if _press_was_double_click:
				_request_action("open_input")
			else:
				_schedule_single_click_action()
		_left_pressed = false
		_press_was_double_click = false
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
	var mouse_position: Vector2i = DisplayServer.mouse_get_position()
	var pet_rect: Rect2i = _window_controller.window_rect()
	var dragging: bool = _window_controller.is_dragging()
	var action: String = hover_action_for_pointer(_hovering_pet, mouse_position, pet_rect, dragging)
	_hovering_pet = not dragging and pet_rect.has_point(mouse_position)
	if action != "":
		_set_menu_visible(true)
	if _hover_menu != null:
		_hover_menu.update_for_pet_window(get_window())
		_hide_menu_if_pointer_left_targets()
	if _window_controller.is_dragging():
		_sync_edge_peek_mode()
		_cancel_pending_single_click()
		_set_menu_visible(false)


func _schedule_single_click_action() -> void:
	_pending_single_click = true
	if _single_click_timer.is_inside_tree():
		_single_click_timer.start()


func _cancel_pending_single_click() -> void:
	_pending_single_click = false
	if _single_click_timer != null:
		_single_click_timer.stop()


func _complete_pending_single_click() -> void:
	if not _pending_single_click:
		return
	_pending_single_click = false
	_set_menu_visible(false)
	_request_action("open_today")


func _on_menu_button_pressed(event_type: String) -> void:
	_cancel_pending_single_click()
	_set_menu_visible(false)
	if event_type == "hide_pet":
		_apply_peek_mode(false)
		_window_controller.tuck_to_edge()
	_request_action(event_type)


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


func _request_action(event_type: String) -> void:
	if _integrated_mode:
		menu_action_requested.emit(event_type)
	elif event_type in ["open_today", "open_input"]:
		open_panel_requested.emit()
