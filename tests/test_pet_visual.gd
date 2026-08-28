extends RefCounted

const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const FurStrandBuilderScript = preload("res://scripts/pet/fur_strand_builder.gd")


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
	var strands := visual.get_node_or_null("Body/FurStrands") as MultiMeshInstance3D
	if strands == null or strands.multimesh == null:
		errors.append("桌宠必须包含独立细毛实例")
	elif strands.multimesh.instance_count != 15000:
		errors.append("独立细毛数量必须为一万五千根")
	else:
		var strand_mesh := strands.multimesh.mesh as ArrayMesh
		var strand_arrays := strand_mesh.surface_get_arrays(0)
		var strand_vertices: PackedVector3Array = strand_arrays[Mesh.ARRAY_VERTEX]
		var strand_normals = strand_arrays[Mesh.ARRAY_NORMAL]
		if strand_normals == null or strand_normals.size() != strand_vertices.size():
			errors.append("独立细毛必须包含完整法线以避免黑色颗粒")
	var strand_direction := Callable(FurStrandBuilderScript, "strand_direction")
	if not strand_direction.is_valid():
		errors.append("细毛构建器必须提供可测试的毛束方向计算")
	else:
		var normal := Vector3(0.0, 0.0, 1.0)
		var hair_direction: Vector3 = strand_direction.call(
			Vector3(0.0, 0.0, 0.82),
			normal,
			Vector3(-1.0, 0.0, 0.0),
			Vector3(0.0, 1.0, 0.0),
			0.0,
			0.0,
		)
		var outward_alignment := hair_direction.dot(normal)
		if outward_alignment >= 0.97 or outward_alignment <= 0.80:
			errors.append("正面细毛必须向外倾斜形成可见毛束")
	if visual.get_node_or_null("Eyes/Left") == null:
		errors.append("桌宠必须包含左眼")
	if visual.get_node_or_null("Eyes/Right") == null:
		errors.append("桌宠必须包含右眼")
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
