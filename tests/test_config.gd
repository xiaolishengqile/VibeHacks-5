extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	if PetConfigScript.WINDOW_SIZE != Vector2i(480, 420):
		errors.append("窗口尺寸必须为 480 × 420")
	if PetConfigScript.FUR_SHELL_COUNT != 16:
		errors.append("默认毛发壳层必须为 16")
	if PetConfigScript.TARGET_FPS != 60:
		errors.append("目标帧率必须为 60")
	return errors
