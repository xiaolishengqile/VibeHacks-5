extends RefCounted

const PetStateScript = preload("res://scripts/pet/pet_state.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	if PetStateScript.normalize("awaiting_approval") != "awaiting_approval":
		errors.append("等待确认状态必须保留")
	if PetStateScript.normalize("unknown") != "idle":
		errors.append("未知状态必须回退待机")
	if PetInteractionScript.is_click(Vector2(10, 10), Vector2(13, 12), 4.0) != true:
		errors.append("短距离按下松开必须识别为单击")
	if PetInteractionScript.is_click(Vector2(10, 10), Vector2(20, 10), 4.0) != false:
		errors.append("超过阈值的移动不能识别为单击")
	var menu := PetInteractionScript.menu_buttons()
	if menu.map(func(button): return button["label"]) != ["工作台", "待办", "输入", "隐藏"]:
		errors.append("桌宠菜单必须使用确认后的四个短名称")
	if menu.map(func(button): return button["event"]) != ["open_workbench", "open_today", "open_input", "hide_pet"]:
		errors.append("桌宠菜单必须发出四个明确事件")
	if PetInteractionScript.menu_visible_after_pet_click(false, true) != true:
		errors.append("单击桌宠必须展开四个按钮")
	if PetInteractionScript.menu_visible_after_pet_click(true, true) != false:
		errors.append("菜单已显示时再次单击桌宠必须收起按钮")
	if PetInteractionScript.menu_visible_after_pet_click(false, false) != false:
		errors.append("拖动桌宠不能误触发菜单")
	var pet_rect := Rect2i(Vector2i(100, 100), Vector2i(200, 200))
	var button_rects: Array[Rect2i] = [Rect2i(Vector2i(320, 80), Vector2i(58, 58))]
	if not PetInteractionScript.should_hide_menu_for_pointer(Vector2i(20, 20), pet_rect, button_rects):
		errors.append("点击桌宠和按钮外的空白区域必须收起菜单")
	if PetInteractionScript.should_hide_menu_for_pointer(Vector2i(120, 120), pet_rect, button_rects):
		errors.append("点击桌宠本体不能按空白区域处理")
	if PetInteractionScript.should_hide_menu_for_pointer(Vector2i(330, 90), pet_rect, button_rects):
		errors.append("点击菜单按钮不能按空白区域处理")
	var menu_rects := PetInteractionScript.menu_button_rects(
		Vector2i(1131, 626),
		Rect2i(Vector2i(0, 0), Vector2i(1440, 900)),
	)
	if menu_rects.map(func(rect): return rect.position) != [
		Vector2i(1093, 738),
		Vector2i(1161, 572),
		Vector2i(1257, 556),
		Vector2i(1353, 584),
	]:
		errors.append("桌宠菜单必须拆成围绕桌宠的独立按钮位置")
	if menu_rects.any(func(rect): return rect.size != Vector2i(58, 58)):
		errors.append("桌宠菜单按钮必须使用独立小窗尺寸")
	var executing = PetStateScript.animation_parameters("executing")
	var idle = PetStateScript.animation_parameters("idle")
	if executing.speed <= idle.speed:
		errors.append("执行状态动画必须比待机更积极")
	return errors
