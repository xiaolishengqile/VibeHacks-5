extends RefCounted

const PetStateScript = preload("res://scripts/pet/pet_state.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")
const PetBridgeClientScript = preload("res://scripts/pet/pet_bridge_client.gd")


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
	var pet_rect := Rect2i(Vector2i(100, 100), Vector2i(200, 200))
	if PetInteractionScript.hover_action_for_pointer(false, Vector2i(120, 120), pet_rect, false) != "open_today":
		errors.append("鼠标进入桌宠区域必须请求显示今日待办")
	if PetInteractionScript.hover_action_for_pointer(true, Vector2i(120, 120), pet_rect, false) != "":
		errors.append("鼠标停留在桌宠区域不能重复请求今日待办")
	if PetInteractionScript.hover_action_for_pointer(true, Vector2i(20, 20), pet_rect, false) != "close_today":
		errors.append("鼠标离开桌宠区域必须请求关闭今日待办")
	if PetInteractionScript.hover_action_for_pointer(false, Vector2i(120, 120), pet_rect, true) != "":
		errors.append("拖动桌宠时不能误触发今日待办")
	if PetInteractionScript.hover_action_for_pointer(true, Vector2i(20, 20), pet_rect, true) != "":
		errors.append("拖动桌宠时不能误触发关闭今日待办")
	var tree := Engine.get_main_loop() as SceneTree
	var bridge_client := PetBridgeClientScript.new()
	tree.root.add_child(bridge_client)
	if not bridge_client.configure(9, "test-token"):
		errors.append("桌宠桥接客户端必须能完成测试配置")
	elif not bridge_client.post_event("open_today") or not bridge_client.post_event("open_input") or not bridge_client.post_event("close_today"):
		errors.append("悬浮今日待办、双击输入和离开关闭不能丢失事件")
	bridge_client.queue_free()
	var executing = PetStateScript.animation_parameters("executing")
	var idle = PetStateScript.animation_parameters("idle")
	if executing.speed <= idle.speed:
		errors.append("执行状态动画必须比待机更积极")
	return errors
