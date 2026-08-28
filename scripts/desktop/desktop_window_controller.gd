class_name DesktopWindowController
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const WindowGeometryScript = preload("res://scripts/desktop/window_geometry.gd")

var _window: Window
var _dragging := false
var _drag_offset := Vector2i.ZERO


func configure(window: Window) -> void:
	_window = window
	_window.size = PetConfigScript.WINDOW_SIZE
	_window.borderless = true
	_window.transparent = true
	_window.transparent_bg = true
	_window.always_on_top = true
	_window.unresizable = true
	_window.unfocusable = true
	_window.mouse_passthrough_polygon = WindowGeometryScript.ellipse_polygon(
		PetConfigScript.WINDOW_SIZE,
		Vector2(120, 115),
		Vector2(92.5, 72.5),
		32,
	)

	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = usable.position + usable.size - _window.size - PetConfigScript.WINDOW_MARGIN


func begin_drag() -> void:
	_dragging = true
	_drag_offset = DisplayServer.mouse_get_position() - _window.position


func update_drag() -> void:
	if _dragging:
		_window.position = DisplayServer.mouse_get_position() - _drag_offset


func end_drag() -> void:
	_dragging = false


func is_dragging() -> bool:
	return _dragging
