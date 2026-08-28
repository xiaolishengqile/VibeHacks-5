extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var constants: Dictionary = PetConfigScript.new().get_script().get_script_constant_map()
	if PetConfigScript.WINDOW_SIZE != Vector2i(264, 231):
		errors.append("窗口必须在原缩小版基础上增大 10%")
	if constants.get("RENDER_SIZE") != Vector2i(528, 462):
		errors.append("内部画面必须使用双倍尺寸渲染")
	if PetConfigScript.FUR_SHELL_COUNT != 48:
		errors.append("密集短绒必须使用 48 层壳层")
	if not is_equal_approx(PetConfigScript.FUR_LENGTH, 0.075):
		errors.append("短绒长度必须为 0.075")
	if PetConfigScript.FUR_RADIAL_SEGMENTS != 128 or PetConfigScript.FUR_RINGS != 64:
		errors.append("身体网格必须提升到 128 × 64")
	if constants.get("FUR_STRAND_COUNT") != 15000:
		errors.append("轮廓必须包含一万五千根独立细毛")
	if ProjectSettings.get_setting("display/window/size/viewport_width") != 528:
		errors.append("项目内部渲染宽度必须为 528")
	if ProjectSettings.get_setting("display/window/size/viewport_height") != 462:
		errors.append("项目内部渲染高度必须为 462")
	if PetConfigScript.TARGET_FPS != 60:
		errors.append("目标帧率必须为 60")
	return errors
