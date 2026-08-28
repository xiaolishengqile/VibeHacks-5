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
	var fur_tufts := visual.get_node_or_null("Body/FurTufts") as MultiMeshInstance3D
	if fur_tufts == null or fur_tufts.multimesh == null:
		errors.append("桌宠必须包含定向细长毛束")
	elif fur_tufts.multimesh.instance_count < 1400:
		errors.append("定向毛束数量不足，无法形成参考图中的蓬松效果")
	else:
		for index in fur_tufts.multimesh.instance_count:
			var origin := fur_tufts.multimesh.get_instance_transform(index).origin
			if origin.z < 0.45:
				continue
			var left_distance := Vector2(
				(origin.x + 0.31) / 0.29,
				(origin.y - 0.14) / 0.27,
			).length()
			var right_distance := Vector2(
				(origin.x - 0.31) / 0.29,
				(origin.y - 0.14) / 0.27,
			).length()
			if minf(left_distance, right_distance) < 1.0:
				errors.append("定向毛束不能穿过眼睛区域")
				break
	if visual.get_node_or_null("Eyes/Left") == null:
		errors.append("桌宠必须包含左眼")
	if visual.get_node_or_null("Eyes/Right") == null:
		errors.append("桌宠必须包含右眼")
	if visual.get_node_or_null("Eyes/Left/UpperLid") == null:
		errors.append("左眼必须包含独立上眼皮")
	if visual.get_node_or_null("Eyes/Right/UpperLid") == null:
		errors.append("右眼必须包含独立上眼皮")
	if visual.get_node_or_null("Body/Hat") != null:
		errors.append("参考效果不能保留紫色帽子")
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
	visual.set_blink(1.0)
	var sleepy_lid_y: float = (visual.get_node("Eyes/Left/UpperLid") as Node3D).position.y
	visual.set_blink(0.0)
	var closed_lid_y: float = (visual.get_node("Eyes/Left/UpperLid") as Node3D).position.y
	if closed_lid_y >= sleepy_lid_y:
		errors.append("闭眼时上眼皮必须向下覆盖眼球")
	if not visual.get_node("Eyes/Left").scale.is_equal_approx(Vector3.ONE):
		errors.append("眨眼不能再压扁整颗眼睛")
	visual.set_gaze(Vector2(0.03, -0.02))
	if not visual.get_node("Eyes/Left/Gaze").position.is_equal_approx(Vector3(0.03, -0.02, 0.0)):
		errors.append("视线偏移未应用到瞳孔组")
	visual.set_shadow(0.5)
	if visual.get_node("Shadow").scale.x <= 0.88:
		errors.append("阴影强度必须同步影响阴影宽度")

	visual.free()
	return errors
