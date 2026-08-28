extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	if PetConfigScript.WINDOW_SIZE != Vector2i(240, 210):
		errors.append("窗口尺寸必须缩小为 240 × 210")
	if PetConfigScript.FUR_SHELL_COUNT != 24:
		errors.append("细密毛发必须使用 24 层壳层")
	if not is_equal_approx(PetConfigScript.FUR_LENGTH, 0.11):
		errors.append("毛发长度必须缩短为 0.11")
	if PetConfigScript.FUR_RADIAL_SEGMENTS != 96 or PetConfigScript.FUR_RINGS != 48:
		errors.append("身体网格必须提升到 96 × 48 以细化毛发")
	if PetConfigScript.TARGET_FPS != 60:
		errors.append("目标帧率必须为 60")
	return errors
