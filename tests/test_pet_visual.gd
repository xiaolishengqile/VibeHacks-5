extends RefCounted

const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var visual := PetVisualScript.new()
	visual.build()

	if visual.get_node_or_null("Body/Base") == null:
		errors.append("桌宠必须包含基础身体")
	var fur_shells := visual.get_node_or_null("Body/FurShells")
	if fur_shells == null or fur_shells.get_child_count() != 48:
		errors.append("桌宠必须包含 48 层密集短绒")
	elif (fur_shells.get_child(0) as MeshInstance3D).material_override.get_shader_parameter(
		"fur_texture"
	) == null:
		errors.append("密集短绒必须使用参考图提炼的真实绒毛材质")
	var body_mesh := (visual.get_node("Body/Base") as MeshInstance3D).mesh as SphereMesh
	if body_mesh.radial_segments != 128 or body_mesh.rings != 64:
		errors.append("身体网格密度不足，毛发轮廓会显得粗糙")
	if visual.get_node_or_null("Body/FurStrands") != null:
		errors.append("桌宠边缘不能保留独立长毛")
	if visual.get_node_or_null("Eyes/Left") == null:
		errors.append("桌宠必须包含左眼")
	if visual.get_node_or_null("Eyes/Right") == null:
		errors.append("桌宠必须包含右眼")
	var hat := visual.get_node_or_null("Body/Hat") as Node3D
	if hat == null:
		errors.append("桌宠必须戴有贝雷帽")
	else:
		var visible_parts := 0
		for child in hat.get_children():
			if child is MeshInstance3D and child.mesh != null:
				visible_parts += 1
		if visible_parts < 3:
			errors.append("贝雷帽必须包含帽檐、帽冠和顶部装饰")
		if hat.position.y < 0.70:
			errors.append("贝雷帽必须位于毛球顶部")
	if visual.get_node_or_null("Shadow") == null:
		errors.append("桌宠必须包含桌面阴影")
	for method_name in ["set_body_pose", "set_blink", "set_gaze", "set_shadow"]:
		if not visual.has_method(method_name):
			errors.append("桌宠外观缺少姿态接口：%s" % method_name)
	if not errors.is_empty():
		visual.free()
		return errors

	visual.set_body_pose(Vector3(1.05, 0.96, 1.0), 0.08)
	if not visual.get_node("Body").scale.is_equal_approx(Vector3(1.05, 0.96, 1.0)):
		errors.append("身体姿态缩放未生效")
	if not is_equal_approx(visual.get_node("Eyes").position.y, 0.08):
		errors.append("眼睛必须跟随身体垂直移动")
	visual.set_blink(0.4)
	if not is_equal_approx(visual.get_node("Eyes/Left").scale.y, 0.4):
		errors.append("眨眼开合值未应用到眼睛")
	visual.set_gaze(Vector2(0.03, -0.02))
	if not visual.get_node("Eyes/Left/Gaze").position.is_equal_approx(Vector3(0.03, -0.02, 0.0)):
		errors.append("视线偏移未应用到瞳孔组")
	visual.set_shadow(0.5)
	if visual.get_node("Shadow").scale.x <= 0.88:
		errors.append("阴影强度必须同步影响阴影宽度")

	visual.free()
	return errors
