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
	var executing = PetStateScript.animation_parameters("executing")
	var idle = PetStateScript.animation_parameters("idle")
	if executing.speed <= idle.speed:
		errors.append("执行状态动画必须比待机更积极")
	return errors
