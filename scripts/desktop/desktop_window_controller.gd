class_name DesktopWindowController
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const WindowGeometryScript = preload("res://scripts/desktop/window_geometry.gd")

var _window: Window
var _dragging := false
var _drag_offset := Vector2i.ZERO


func configure(window: Window) -> void:
	_window = window
	var screen := DisplayServer.window_get_current_screen()
	var screen_scale := DisplayServer.screen_get_scale(screen)
	_window.size = WindowGeometryScript.physical_window_size(
		PetConfigScript.WINDOW_SIZE,
		screen_scale,
	)
	_window.borderless = true
	_window.transparent = true
	_window.transparent_bg = true
	_window.always_on_top = true
	_window.unresizable = true
	_window.unfocusable = true
	var input_scale := Vector2(_window.size) / Vector2(PetConfigScript.WINDOW_SIZE)
	_window.mouse_passthrough_polygon = WindowGeometryScript.ellipse_polygon(
		_window.size,
		Vector2(PetConfigScript.WINDOW_SIZE) * 0.5 * input_scale,
		Vector2(PetConfigScript.WINDOW_SIZE) * Vector2(0.475, 0.4833) * input_scale,
		32,
	)

	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = WindowGeometryScript.bottom_right_position(
		usable,
		_window.size,
		PetConfigScript.WINDOW_MARGIN,
		screen_scale,
	)


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


func is_near_right_edge() -> bool:
	var screen := DisplayServer.window_get_current_screen()
	var screen_scale := DisplayServer.screen_get_scale(screen)
	var threshold := roundi(float(PetConfigScript.PEEK_EDGE_THRESHOLD) * maxf(screen_scale, 1.0))
	return WindowGeometryScript.is_near_right_edge(
		Rect2i(_window.position, _window.size),
		DisplayServer.screen_get_usable_rect(screen),
		threshold,
	)


func snap_to_right_edge() -> void:
	var screen := DisplayServer.window_get_current_screen()
	var usable := DisplayServer.screen_get_usable_rect(screen)
	_window.position = Vector2i(
		usable.end.x - _window.size.x,
		clampi(_window.position.y, usable.position.y, usable.end.y - _window.size.y),
	)
