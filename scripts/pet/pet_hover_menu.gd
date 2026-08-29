class_name PetHoverMenu
extends Node

signal action_requested(event_type: String)

const BUTTON_SIZE := Vector2i(58, 58)
const MENU_GAP_MARGIN := 14
const BUTTON_SPECS := [
	{"label": "工作台", "event": "open_workbench", "offset": Vector2i(-38, 112)},
	{"label": "今日", "event": "open_today", "offset": Vector2i(30, -54)},
	{"label": "想法", "event": "open_input", "offset": Vector2i(126, -70)},
	{"label": "隐藏", "event": "hide_pet", "offset": Vector2i(222, -42)},
]

var _button_windows: Array[Window] = []
var _visible := false


func setup() -> void:
	if not _button_windows.is_empty():
		return
	for spec in BUTTON_SPECS:
		var window := Window.new()
		window.name = "PetMenuButton"
		window.visible = false
		window.size = BUTTON_SIZE
		window.force_native = true
		window.borderless = true
		window.transparent = true
		window.transparent_bg = true
		window.always_on_top = true
		window.unresizable = true
		window.unfocusable = true

		var button := Button.new()
		button.text = String(spec["label"])
		button.position = Vector2.ZERO
		button.size = Vector2(BUTTON_SIZE)
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.add_theme_font_size_override("font_size", 14)
		button.add_theme_color_override("font_color", Color("4b3426"))
		button.add_theme_color_override("font_hover_color", Color("2f2119"))
		button.add_theme_stylebox_override("normal", _button_style(Color("ffe1a1"), Color("684734")))
		button.add_theme_stylebox_override("hover", _button_style(Color("ffd483"), Color("563927")))
		button.add_theme_stylebox_override("pressed", _button_style(Color("ffc463"), Color("563927")))
		button.pressed.connect(_on_button_pressed.bind(String(spec["event"])))
		window.add_child(button)

		add_child(window)
		_button_windows.append(window)


static func buttons() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for spec in BUTTON_SPECS:
		var offset: Vector2i = spec["offset"]
		result.append({
			"label": spec["label"],
			"event": spec["event"],
			"position": offset,
		})
	return result


static func button_rects(pet_position: Vector2i, work_area: Rect2i) -> Array[Rect2i]:
	var rects: Array[Rect2i] = []
	for spec in BUTTON_SPECS:
		var offset: Vector2i = spec["offset"]
		var desired := pet_position + offset
		var right := work_area.position.x + work_area.size.x - BUTTON_SIZE.x
		var bottom := work_area.position.y + work_area.size.y - BUTTON_SIZE.y
		rects.append(Rect2i(
			Vector2i(
				clampi(desired.x, work_area.position.x, right),
				clampi(desired.y, work_area.position.y, bottom),
			),
			BUTTON_SIZE,
		))
	return rects


static func should_show_menu(
	menu_visible: bool,
	pet_rect: Rect2i,
	button_rects_value: Array[Rect2i],
	mouse_position: Vector2i,
) -> bool:
	if pet_rect.has_point(mouse_position):
		return true
	if not menu_visible:
		return false
	return _menu_zone(pet_rect, button_rects_value, MENU_GAP_MARGIN).has_point(mouse_position)


func update_for_pet_window(pet_window: Window) -> void:
	if pet_window == null or _button_windows.is_empty():
		return
	var rects := button_rects(pet_window.position, _work_area())
	for index in _button_windows.size():
		_button_windows[index].position = rects[index].position


func wants_visible_at(mouse_position: Vector2i, pet_window: Window) -> bool:
	if pet_window == null:
		return false
	var pet_rect := Rect2i(pet_window.position, pet_window.size)
	return should_show_menu(_visible, pet_rect, button_rects(pet_window.position, _work_area()), mouse_position)


func set_menu_visible(visible: bool) -> void:
	if _visible == visible:
		return
	_visible = visible
	for window in _button_windows:
		if visible:
			window.show()
		else:
			window.hide()


func is_menu_visible() -> bool:
	return _visible


static func _menu_zone(pet_rect: Rect2i, button_rects_value: Array[Rect2i], margin: int) -> Rect2i:
	var left := pet_rect.position.x
	var top := pet_rect.position.y
	var right := pet_rect.position.x + pet_rect.size.x
	var bottom := pet_rect.position.y + pet_rect.size.y
	for rect in button_rects_value:
		left = mini(left, rect.position.x)
		top = mini(top, rect.position.y)
		right = maxi(right, rect.position.x + rect.size.x)
		bottom = maxi(bottom, rect.position.y + rect.size.y)
	return Rect2i(
		Vector2i(left - margin, top - margin),
		Vector2i(right - left + margin * 2, bottom - top + margin * 2),
	)


func _button_style(fill: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(3)
	style.set_corner_radius_all(29)
	return style


func _on_button_pressed(event_type: String) -> void:
	action_requested.emit(event_type)


func _work_area() -> Rect2i:
	var screen := DisplayServer.window_get_current_screen()
	return DisplayServer.screen_get_usable_rect(screen)
