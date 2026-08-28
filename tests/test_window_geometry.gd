extends RefCounted

const WindowGeometryScript = preload("res://scripts/desktop/window_geometry.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var size := Vector2i(264, 231)
	var center := Vector2(132, 126.5)
	var polygon := WindowGeometryScript.ellipse_polygon(
		size,
		center,
		Vector2(101.75, 79.75),
		32,
	)

	if polygon.size() != 32:
		errors.append("桌宠命中区域必须包含 32 个顶点")
		return errors
	if not polygon[0].is_equal_approx(Vector2(233.75, 126.5)):
		errors.append("命中区域首个顶点位置错误")
	if not (polygon[0] + polygon[16]).is_equal_approx(center * 2.0):
		errors.append("命中区域对向顶点必须围绕中心对称")
	for point in polygon:
		if point.x < 0.0 or point.y < 0.0 or point.x > size.x or point.y > size.y:
			errors.append("命中区域顶点不能超出窗口")
			break

	var window := Window.new()
	var controller = DesktopWindowControllerScript.new()
	controller.configure(window)
	if window.size != Vector2i(264, 231):
		errors.append("窗口控制器必须应用增大 10% 后的尺寸")
	if not window.borderless or not window.transparent or not window.always_on_top:
		errors.append("窗口控制器必须启用无边框、透明和置顶")
	controller.begin_drag()
	if not controller.is_dragging():
		errors.append("开始拖拽后必须进入拖拽状态")
	controller.update_drag()
	controller.end_drag()
	if controller.is_dragging():
		errors.append("结束拖拽后必须离开拖拽状态")
	window.free()
	return errors
