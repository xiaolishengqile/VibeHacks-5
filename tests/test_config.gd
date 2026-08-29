extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var constants: Dictionary = PetConfigScript.new().get_script().get_script_constant_map()
	if PetConfigScript.WINDOW_SIZE != Vector2i(120, 120):
		errors.append("窗口必须缩小为当前尺寸的一半")
	if constants.get("RENDER_SIZE") != Vector2i(900, 900):
		errors.append("内部画面必须使用高清尺寸保持二维边缘清晰")
	if ProjectSettings.get_setting("display/window/size/viewport_width") != 900:
		errors.append("项目内部渲染宽度必须为 900")
	if ProjectSettings.get_setting("display/window/size/viewport_height") != 900:
		errors.append("项目内部渲染高度必须为 900")
	if ProjectSettings.get_setting("display/window/size/window_width_override") != 120:
		errors.append("桌宠显示宽度必须缩小到 120")
	if ProjectSettings.get_setting("display/window/size/window_height_override") != 120:
		errors.append("桌宠显示高度必须缩小到 120")
	if ProjectSettings.get_setting("display/window/stretch/mode") != "canvas_items":
		errors.append("二维画布必须完整缩放进窗口")
	if ProjectSettings.get_setting("display/window/size/no_focus") != false:
		errors.append("桌宠主窗口必须允许鼠标点击交互")
	if PetConfigScript.TARGET_FPS != 60:
		errors.append("目标帧率必须为 60")
	return errors
