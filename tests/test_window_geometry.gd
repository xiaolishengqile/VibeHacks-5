extends RefCounted

const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var window := Window.new()
	var controller = DesktopWindowControllerScript.new()
	controller.configure(window)
	if window.size != Vector2i(285, 250):
		errors.append("窗口控制器必须应用为帽子扩大的尺寸")
	if not window.borderless or not window.transparent or not window.always_on_top:
		errors.append("窗口控制器必须启用无边框、透明和置顶")
	if window.unfocusable:
		errors.append("桌宠窗口必须可交互，点击才能展开菜单")
	if not window.mouse_passthrough_polygon.is_empty():
		errors.append("桌宠窗口不能再用小命中区限制点击范围")
	controller.begin_drag()
	if not controller.is_dragging():
		errors.append("开始拖拽后必须进入拖拽状态")
	controller.update_drag()
	controller.end_drag()
	if controller.is_dragging():
		errors.append("结束拖拽后必须离开拖拽状态")
	var tucked_position := DesktopWindowControllerScript.tucked_position(
		Rect2i(Vector2i(0, 0), Vector2i(1440, 900)),
		Vector2i(285, 250),
		"right",
		36,
	)
	if tucked_position != Vector2i(1404, 626):
		errors.append("贴边隐藏必须保留可唤回的边缘区域")
	window.free()
	return errors
