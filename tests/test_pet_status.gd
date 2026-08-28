extends RefCounted

const PetStateScript = preload("res://scripts/pet/pet_state.gd")
const EXPECTED_STATES := [
	"idle",
	"urgent",
	"thinking",
	"awaiting_approval",
	"executing",
	"completed",
	"failed",
]
const REQUIRED_PARAMETERS := ["speed", "breath", "float", "lift"]


static func run() -> Array[String]:
	var errors: Array[String] = []
	if PetStateScript.STATES != EXPECTED_STATES:
		errors.append("桌宠必须完整支持所有业务状态")
	for state in EXPECTED_STATES:
		if PetStateScript.normalize(state) != state:
			errors.append("桌宠状态无法规范化：%s" % state)
			continue
		var parameters: Dictionary = PetStateScript.animation_parameters(state)
		for parameter in REQUIRED_PARAMETERS:
			if not parameters.has(parameter) or not parameters[parameter] is float:
				errors.append("桌宠状态 %s 缺少动画参数 %s" % [state, parameter])
	if PetStateScript.animation_parameters("unsupported") != PetStateScript.animation_parameters("idle"):
		errors.append("未知业务状态必须安全回退为待机动画")
	return errors
