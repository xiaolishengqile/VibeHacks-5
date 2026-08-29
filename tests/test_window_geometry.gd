extends RefCounted

const WindowGeometryScript = preload("res://scripts/desktop/window_geometry.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var size := Vector2i(120, 120)
	var center := Vector2(60, 60)
	var polygon := WindowGeometryScript.ellipse_polygon(
		size,
		center,
		Vector2(57, 58),
		32,
	)

	if polygon.size() != 32:
		errors.append("桌宠命中区域必须包含 32 个顶点")
		return errors
	if not polygon[0].is_equal_approx(Vector2(117, 60)):
		errors.append("命中区域首个顶点位置错误")
	if not (polygon[0] + polygon[16]).is_equal_approx(center * 2.0):
		errors.append("命中区域对向顶点必须围绕中心对称")
	for point in polygon:
		if point.x < 0.0 or point.y < 0.0 or point.x > size.x or point.y > size.y:
			errors.append("命中区域顶点不能超出窗口")
			break

	var geometry_script: Script = WindowGeometryScript
	var has_placement_method := false
	for method in geometry_script.get_script_method_list():
		if method.name == "bottom_right_position":
			has_placement_method = true
			break
	if not has_placement_method:
		errors.append("窗口几何必须支持高分屏右下角定位")
	else:
		var has_size_method := false
		for method in geometry_script.get_script_method_list():
			if method.name == "physical_window_size":
				has_size_method = true
				break
		if not has_size_method:
			errors.append("窗口几何必须支持高分屏窗口尺寸换算")
			return errors
		var physical_size: Vector2i = geometry_script.call(
			"physical_window_size",
			Vector2i(300, 300),
			2.0,
		)
		if physical_size != Vector2i(600, 600):
			errors.append("二倍屏幕上的窗口物理尺寸必须放大两倍")
		var placement: Vector2i = geometry_script.call(
			"bottom_right_position",
			Rect2i(0, 76, 2940, 1684),
			physical_size,
			Vector2i(24, 24),
			2.0,
		)
		if placement != Vector2i(2292, 1112):
			errors.append("高分屏右下角定位必须换算窗口尺寸和边距")

	if not WindowGeometryScript.is_near_right_edge(
		Rect2i(800, 300, 120, 120),
		Rect2i(0, 0, 940, 700),
		20,
	):
		errors.append("窗口距离桌面右侧 20 像素时必须进入探头范围")
	if WindowGeometryScript.is_near_right_edge(
		Rect2i(700, 300, 120, 120),
		Rect2i(0, 0, 940, 700),
		20,
	):
		errors.append("窗口远离桌面右侧时不能进入探头范围")
	if not WindowGeometryScript.is_near_right_edge(
		Rect2i(830, 300, 120, 120),
		Rect2i(0, 0, 940, 700),
		20,
	):
		errors.append("窗口越过桌面右侧时仍必须保持探头状态")
	var window := Window.new()
	var controller = DesktopWindowControllerScript.new()
	controller.configure(window)
	if window.size != Vector2i(120, 120):
		errors.append("窗口控制器必须应用二维猫咪的方形尺寸")
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
