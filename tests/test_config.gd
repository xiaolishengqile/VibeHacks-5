extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var constants: Dictionary = PetConfigScript.new().get_script().get_script_constant_map()
	if PetConfigScript.WINDOW_SIZE != Vector2i(285, 250):
		errors.append("窗口必须保持绿色毛球的紧凑尺寸")
	if constants.get("RENDER_SIZE") != Vector2i(855, 750):
		errors.append("内部画面必须使用三倍尺寸保留细长毛发")
	if PetConfigScript.FUR_SHELL_COUNT != 48:
		errors.append("密集短绒必须使用 48 层壳层")
	if not is_equal_approx(PetConfigScript.FUR_LENGTH, 0.09):
		errors.append("底层绒毛长度必须提升到 0.09")
	if PetConfigScript.FUR_RADIAL_SEGMENTS != 128 or PetConfigScript.FUR_RINGS != 64:
		errors.append("身体网格必须提升到 128 × 64")
	if ProjectSettings.get_setting("display/window/size/viewport_width") != 855:
		errors.append("项目内部渲染宽度必须为 855")
	if ProjectSettings.get_setting("display/window/size/viewport_height") != 750:
		errors.append("项目内部渲染高度必须为 750")
	if ProjectSettings.get_setting("display/window/size/no_focus") != false:
		errors.append("桌宠主窗口必须允许鼠标点击交互")
	if PetConfigScript.TARGET_FPS != 60:
		errors.append("目标帧率必须为 60")
	return errors
