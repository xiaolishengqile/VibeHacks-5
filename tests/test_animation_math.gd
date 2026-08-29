extends RefCounted

const PetAnimatorScript = preload("res://scripts/pet/pet_animator.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	if not PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_RIGHT, true):
		errors.append("右键按下必须请求退出")
	if PetInteractionScript.should_quit_for_button(MOUSE_BUTTON_LEFT, true):
		errors.append("左键不能请求退出")
	if not is_equal_approx(PetInteractionScript.click_threshold_for_scale(2.0), 8.0):
		errors.append("二倍高分屏的点击容差必须同步放大")

	var visual := PetVisualScript.new()
	visual.build()
	var animator := PetAnimatorScript.new()
	animator.setup(visual)
	animator.react()

	var window := Window.new()
	var window_controller = DesktopWindowControllerScript.new()
	window_controller.configure(window)
	var interaction := PetInteractionScript.new()
	interaction.setup(window_controller, animator, visual)
	var menu = interaction.get_node("PetHoverMenu")
	var peek_toggle := visual.get_node("PeekToggle") as Button
	peek_toggle.pressed.emit()
	if not visual.is_peek_mode():
		errors.append("手动按钮必须能进入探头状态")
	var usable := DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
	if window.position.x + window.size.x != usable.end.x:
		errors.append("手动进入探头状态时必须贴紧桌面右侧")
	menu.action_requested.emit("hide_pet")
	if visual.is_peek_mode():
		errors.append("探头状态隐藏前必须恢复完整立绘，保留可见唤回区域")
	window_controller.restore_from_tucked()
	peek_toggle.pressed.emit()
	peek_toggle.pressed.emit()
	if visual.is_peek_mode():
		errors.append("手动按钮必须能退出探头状态")
	var opened_panel := false
	interaction.open_panel_requested.connect(func(): opened_panel = true)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	interaction._unhandled_input(press)
	if not window_controller.is_dragging():
		errors.append("左键按下必须开始拖拽")
	press.pressed = false
	interaction._unhandled_input(press)
	if window_controller.is_dragging():
		errors.append("左键松开必须结束拖拽")
	if opened_panel:
		errors.append("单击桌宠不能再直接打开轻面板")
	var menu_window_count := 0
	var menu_fill_colors: Array[Color] = []
	var menu_border_colors: Array[Color] = []
	var menu_labels: Array[String] = []
	var menu_descriptions: Array[String] = []
	var small_description_count := 0
	for child in menu.get_children():
		if child is Window:
			menu_window_count += 1
			if child.unfocusable:
				errors.append("菜单按钮窗口必须可交互，点击按钮才能触发入口")
			if child.get_child_count() == 0:
				errors.append("菜单按钮窗口必须包含可点击按钮")
			else:
				var button := child.get_child(0) as Button
				if button == null:
					errors.append("菜单按钮窗口必须包含可点击按钮")
					continue
				var style := button.get_theme_stylebox("normal") as StyleBoxFlat
				if style == null:
					errors.append("菜单按钮必须有明确的默认样式")
				else:
					menu_fill_colors.append(style.bg_color)
					menu_border_colors.append(style.border_color)
				var texts := _label_texts(button)
				if texts.size() != 2:
					errors.append("菜单按钮必须显示主标题和小字描述")
				else:
					menu_labels.append(texts[0])
					menu_descriptions.append(texts[1])
					var sizes := _label_font_sizes(button)
					if sizes.size() == 2 and sizes[1] < sizes[0]:
						small_description_count += 1
					for label in _labels(button):
						if not label.has_theme_font_override("font"):
							errors.append("菜单按钮中文文本必须指定中文字体")
	if menu_window_count != 4:
		errors.append("桌宠菜单必须创建四个独立按钮窗口")
	if menu_labels != ["工作台", "今日", "想法", "隐藏"]:
		errors.append("菜单按钮主标题必须保留原有功能名称")
	if menu_descriptions != ["全局", "待办", "输入", "收纳"]:
		errors.append("菜单按钮小字描述必须说明各自功能")
	if small_description_count != 4:
		errors.append("菜单按钮描述必须使用小于主标题的字号")
	if _unique_color_count(menu_fill_colors) != 4:
		errors.append("四个菜单按钮必须用不同背景色区分功能")
	if _unique_color_count(menu_border_colors) != 4:
		errors.append("四个菜单按钮必须用不同边框色区分功能")
	if not menu.is_menu_visible():
		errors.append("单击桌宠必须显示四个菜单按钮")
	press.pressed = true
	interaction._unhandled_input(press)
	press.pressed = false
	interaction._unhandled_input(press)
	if menu.is_menu_visible():
		errors.append("再次单击桌宠必须收起四个菜单按钮")
	interaction._on_menu_button_pressed("hide_pet")
	var tucked := DesktopWindowControllerScript.tucked_position(
		DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen()),
		window.size,
	)
	if window.position != tucked:
		errors.append("隐藏按钮必须把桌宠收纳到屏幕边缘")

	interaction.free()
	window.free()
	animator.free()
	visual.free()
	return errors


static func _label_texts(node: Node) -> Array[String]:
	var result: Array[String] = []
	for child in node.get_children():
		if child is Label:
			result.append(child.text)
		result.append_array(_label_texts(child))
	return result


static func _labels(node: Node) -> Array[Label]:
	var result: Array[Label] = []
	for child in node.get_children():
		if child is Label:
			result.append(child)
		result.append_array(_labels(child))
	return result


static func _label_font_sizes(node: Node) -> Array[int]:
	var result: Array[int] = []
	for child in node.get_children():
		if child is Label:
			result.append(child.get_theme_font_size("font_size"))
		result.append_array(_label_font_sizes(child))
	return result


static func _unique_color_count(colors: Array[Color]) -> int:
	var unique: Array[Color] = []
	for color in colors:
		if not unique.has(color):
			unique.append(color)
	return unique.size()
