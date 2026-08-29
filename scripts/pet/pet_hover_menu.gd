class_name PetHoverMenu
extends Node

signal action_requested(event_type: String)
signal focus_moved

const BUTTON_SIZE := Vector2i(58, 58)
const BUTTON_MARGIN := 6
const TITLE_FONT_SIZE := 13
const CHINESE_FONT_PATHS := [
	"/System/Library/Fonts/Hiragino Sans GB.ttc",
	"/System/Library/Fonts/STHeiti Medium.ttc",
	"/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
const BUTTON_SPECS := [
	{
		"label": "工作台",
		"event": "open_workbench",
		"offset": Vector2i(-38, 112),
		"font": Color("17324d"),
		"normal": Color("dff0ff"),
		"hover": Color("cce5ff"),
		"pressed": Color("b7d8ff"),
		"border": Color("3d7bb8"),
	},
	{
		"label": "待办",
		"event": "open_today",
		"offset": Vector2i(30, -54),
		"font": Color("233b24"),
		"normal": Color("e3f7d5"),
		"hover": Color("d4edc4"),
		"pressed": Color("c0e3af"),
		"border": Color("5d9b52"),
	},
	{
		"label": "输入",
		"event": "open_input",
		"offset": Vector2i(126, -70),
		"font": Color("3b294d"),
		"normal": Color("efe4ff"),
		"hover": Color("e2d3fa"),
		"pressed": Color("d3c0f2"),
		"border": Color("8b67c9"),
	},
	{
		"label": "隐藏",
		"event": "hide_pet",
		"offset": Vector2i(222, -42),
		"font": Color("512126"),
		"normal": Color("ffe3e1"),
		"hover": Color("ffd0cd"),
		"pressed": Color("ffbbb8"),
		"border": Color("c7525c"),
	},
]

var _button_windows: Array[Window] = []
var _visible := false


func setup() -> void:
	if not _button_windows.is_empty():
		return
	var text_font := _button_font()
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
		window.unfocusable = false
		window.focus_exited.connect(_on_window_focus_exited)

		var button := Button.new()
		button.text = ""
		button.position = Vector2.ZERO
		button.size = Vector2(BUTTON_SIZE)
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		var font_color: Color = spec["font"]
		var border_color: Color = spec["border"]
		button.add_theme_color_override("font_color", font_color)
		button.add_theme_color_override("font_hover_color", font_color)
		button.add_theme_stylebox_override("normal", _button_style(spec["normal"], border_color))
		button.add_theme_stylebox_override("hover", _button_style(spec["hover"], border_color))
		button.add_theme_stylebox_override("pressed", _button_style(spec["pressed"], border_color))
		button.pressed.connect(_on_button_pressed.bind(String(spec["event"])))
		_add_button_text(button, String(spec["label"]), font_color, text_font)
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


func update_for_pet_window(pet_window: Window) -> void:
	if pet_window == null or _button_windows.is_empty():
		return
	var rects := button_rects(pet_window.position, _work_area())
	for index in _button_windows.size():
		_button_windows[index].position = rects[index].position


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


func global_button_rects() -> Array[Rect2i]:
	var rects: Array[Rect2i] = []
	for window in _button_windows:
		rects.append(Rect2i(window.position, window.size))
	return rects


func _button_style(fill: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(3)
	style.set_corner_radius_all(29)
	return style


func _add_button_text(button: Button, label: String, font_color: Color, font: Font) -> void:
	var content := VBoxContainer.new()
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.offset_left = BUTTON_MARGIN
	content.offset_top = BUTTON_MARGIN
	content.offset_right = -BUTTON_MARGIN
	content.offset_bottom = -BUTTON_MARGIN
	content.add_child(_button_label(label, font_color, TITLE_FONT_SIZE, font))
	button.add_child(content)


func _button_label(text: String, font_color: Color, font_size: int, font: Font) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_override("font", font)
	label.add_theme_color_override("font_color", font_color)
	label.add_theme_font_size_override("font_size", font_size)
	return label


func _button_font() -> Font:
	for path in CHINESE_FONT_PATHS:
		if FileAccess.file_exists(path):
			var font := FontFile.new()
			if font.load_dynamic_font(path) == OK:
				return font
	return SystemFont.new()


func _on_button_pressed(event_type: String) -> void:
	action_requested.emit(event_type)


func _on_window_focus_exited() -> void:
	focus_moved.emit()


func _work_area() -> Rect2i:
	var screen := DisplayServer.window_get_current_screen()
	return DisplayServer.screen_get_usable_rect(screen)
