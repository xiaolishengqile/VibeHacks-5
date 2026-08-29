class_name DesktopWindowController
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const TUCKED_VISIBLE_STRIP := 36

var _window: Window
var _dragging := false
var _drag_offset := Vector2i.ZERO
var _tucked := false
var _tuck_edge := "right"


func configure(window: Window) -> void:
	_window = window
	_window.size = PetConfigScript.WINDOW_SIZE
	_window.borderless = true
	_window.transparent = true
	_window.transparent_bg = true
	_window.always_on_top = true
	_window.unresizable = true
	_window.unfocusable = false
	_window.mouse_passthrough_polygon = PackedVector2Array()

	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = usable.position + usable.size - _window.size - PetConfigScript.WINDOW_MARGIN


static func tucked_position(
	work_area: Rect2i,
	window_size: Vector2i,
	edge: String = "right",
	visible_strip: int = TUCKED_VISIBLE_STRIP,
) -> Vector2i:
	var y := work_area.position.y + work_area.size.y - window_size.y - PetConfigScript.WINDOW_MARGIN.y
	if edge == "left":
		return Vector2i(work_area.position.x - window_size.x + visible_strip, y)
	return Vector2i(work_area.position.x + work_area.size.x - visible_strip, y)


static func visible_position_for_edge(
	work_area: Rect2i,
	window_size: Vector2i,
	edge: String = "right",
) -> Vector2i:
	var y := work_area.position.y + work_area.size.y - window_size.y - PetConfigScript.WINDOW_MARGIN.y
	if edge == "left":
		return Vector2i(work_area.position.x, y)
	return Vector2i(work_area.position.x + work_area.size.x - window_size.x, y)


func set_menu_expanded(_expanded: bool) -> void:
	if _window == null:
		return
	_window.mouse_passthrough_polygon = PackedVector2Array()


func tuck_to_edge(edge: String = "right") -> void:
	if _window == null:
		return
	_tucked = true
	_tuck_edge = edge
	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = tucked_position(usable, _window.size, edge)
	set_menu_expanded(false)


func restore_from_tucked() -> void:
	if _window == null or not _tucked:
		return
	_tucked = false
	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = visible_position_for_edge(usable, _window.size, _tuck_edge)
	set_menu_expanded(true)


func begin_drag() -> void:
	restore_from_tucked()
	_dragging = true
	_drag_offset = DisplayServer.mouse_get_position() - _window.position


func update_drag() -> void:
	if _dragging:
		_tucked = false
		_window.position = DisplayServer.mouse_get_position() - _drag_offset


func end_drag() -> void:
	_dragging = false


func is_dragging() -> bool:
	return _dragging
