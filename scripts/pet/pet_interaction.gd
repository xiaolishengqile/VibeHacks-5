class_name PetInteraction
extends Node

signal open_panel_requested
signal quit_requested
signal menu_action_requested(event_type: String)

const CLICK_THRESHOLD := 4.0
const MENU_BUTTON_SIZE := Vector2(58, 58)

var _window_controller
var _animator: Node
var _integrated_mode := false
var _left_pressed := false
var _drag_started := false
var _press_position := Vector2.ZERO
var _menu_root: Control
var _menu_button_controls: Array[Button] = []
var _menu_visible := false


func setup(window_controller, animator: Node, integrated_mode: bool = false) -> void:
	_window_controller = window_controller
	_animator = animator
	_integrated_mode = integrated_mode
	_build_menu()
	set_process(true)
	set_process_input(true)


static func menu_buttons() -> Array[Dictionary]:
	return [
		{"label": "工作台", "event": "open_workbench", "position": Vector2(8, 118)},
		{"label": "今日", "event": "open_today", "position": Vector2(82, 28)},
		{"label": "想法", "event": "open_input", "position": Vector2(152, 28)},
		{"label": "隐藏", "event": "hide_pet", "position": Vector2(219, 118)},
	]


static func should_quit_for_button(button_index: MouseButton, pressed: bool) -> bool:
	return button_index == MOUSE_BUTTON_RIGHT and pressed


static func is_click(press_position: Vector2, release_position: Vector2, threshold: float = CLICK_THRESHOLD) -> bool:
	return press_position.distance_to(release_position) <= threshold


func _input(event: InputEvent) -> void:
	if not event is InputEventMouseButton:
		return
	if _menu_visible and _is_menu_point(_local_mouse_position()):
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
	var local_mouse := _local_mouse_position()
	_animator.set_mouse_position(local_mouse)
	var hovering := Rect2(Vector2.ZERO, Vector2(get_window().size)).has_point(local_mouse)
	_set_menu_visible(hovering and not _window_controller.is_dragging())


func _build_menu() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HoverMenuLayer"
	add_child(layer)
	_menu_root = Control.new()
	_menu_root.name = "HoverMenu"
	_menu_root.visible = false
	_menu_root.mouse_filter = Control.MOUSE_FILTER_PASS
	_menu_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_menu_root)
	for item in menu_buttons():
		var button := Button.new()
		button.text = item["label"]
		button.position = item["position"]
		button.size = MENU_BUTTON_SIZE
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.add_theme_font_size_override("font_size", 14)
		button.add_theme_color_override("font_color", Color("4b3426"))
		button.add_theme_color_override("font_hover_color", Color("2f2119"))
		button.add_theme_stylebox_override("normal", _menu_button_style(Color("ffe1a1"), Color("684734")))
		button.add_theme_stylebox_override("hover", _menu_button_style(Color("ffd483"), Color("563927")))
		button.add_theme_stylebox_override("pressed", _menu_button_style(Color("ffc463"), Color("563927")))
		button.pressed.connect(_on_menu_button_pressed.bind(item["event"]))
		_menu_root.add_child(button)
		_menu_button_controls.append(button)


func _menu_button_style(fill: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(3)
	style.set_corner_radius_all(29)
	return style


func _on_menu_button_pressed(event_type: String) -> void:
	if event_type == "hide_pet":
		_window_controller.tuck_to_edge()
	if _integrated_mode:
		menu_action_requested.emit(event_type)
	elif event_type in ["open_today", "open_input"]:
		open_panel_requested.emit()
	_set_menu_visible(false)


func _set_menu_visible(visible: bool) -> void:
	if _menu_visible == visible:
		return
	_menu_visible = visible
	if _menu_root != null:
		_menu_root.visible = visible
	if visible:
		_window_controller.restore_from_tucked()
	_window_controller.set_menu_expanded(visible)


func _is_menu_point(local_mouse: Vector2) -> bool:
	for button in _menu_button_controls:
		if button.get_rect().has_point(local_mouse):
			return true
	return false


func _local_mouse_position() -> Vector2:
	return Vector2(DisplayServer.mouse_get_position() - get_window().position)
