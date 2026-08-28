class_name FurTuftBuilder
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")

const TUFT_COUNT := 4800
const CANDIDATE_COUNT := 5600
const BODY_RADIUS := 0.82
const EYE_CENTERS := [Vector2(-0.31, 0.14), Vector2(0.31, 0.14)]
const EYE_CLEAR_RADIUS := Vector2(0.29, 0.27)


static func create() -> MultiMeshInstance3D:
	var instance := MultiMeshInstance3D.new()
	instance.name = "FurTufts"
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = _create_tuft_mesh()
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for index in CANDIDATE_COUNT:
		var direction := _fibonacci_direction(index, CANDIDATE_COUNT)
		var point := Vector3(
			direction.x * BODY_RADIUS * PetConfigScript.BODY_SCALE.x,
			direction.y * BODY_RADIUS * PetConfigScript.BODY_SCALE.y,
			direction.z * BODY_RADIUS * PetConfigScript.BODY_SCALE.z,
		)
		if _inside_eye_clearance(point):
			continue
		var normal := Vector3(
			direction.x / PetConfigScript.BODY_SCALE.x,
			direction.y / PetConfigScript.BODY_SCALE.y,
			direction.z / PetConfigScript.BODY_SCALE.z,
		).normalized()
		var flow := Vector3(-normal.y, normal.x, 0.0)
		var lean := lerpf(0.34, 0.64, _random01(index, 1))
		if _random01(index, 5) < 0.18:
			lean *= -0.45
		var tuft_direction := (
			normal * 0.72 + flow.normalized() * lean + Vector3.DOWN * 0.08
		).normalized()
		var tangent := Vector3.UP.cross(tuft_direction)
		if tangent.length_squared() < 0.001:
			tangent = Vector3.RIGHT
		else:
			tangent = tangent.normalized()
		var bitangent := tuft_direction.cross(tangent).normalized()
		var silhouette := 1.0 - absf(normal.z)
		var length := lerpf(0.038, 0.12, pow(silhouette, 0.72))
		length *= lerpf(0.78, 1.16, _random01(index, 2))
		var width := lerpf(0.012, 0.024, silhouette)
		var basis := Basis(
			tangent * width,
			tuft_direction * length,
			bitangent * width,
		)
		transforms.append(
			Transform3D(basis, point + normal * lerpf(0.014, 0.035, silhouette))
		)
		var tone := lerpf(-0.025, 0.02, _random01(index, 4))
		colors.append(
			PetConfigScript.BODY_COLOR.darkened(-tone)
			if tone < 0.0
			else PetConfigScript.BODY_COLOR.lightened(tone)
		)
		if transforms.size() == TUFT_COUNT:
			break

	multimesh.instance_count = transforms.size()
	for index in transforms.size():
		multimesh.set_instance_transform(index, transforms[index])
		multimesh.set_instance_color(index, colors[index])
	instance.multimesh = multimesh
	return instance


static func _inside_eye_clearance(point: Vector3) -> bool:
	if point.z < 0.45:
		return false
	for center in EYE_CENTERS:
		var distance := Vector2(
			(point.x - center.x) / EYE_CLEAR_RADIUS.x,
			(point.y - center.y) / EYE_CLEAR_RADIUS.y,
		).length()
		if distance < 1.0:
			return true
	return false


static func _fibonacci_direction(index: int, count: int) -> Vector3:
	var ratio := (float(index) + 0.5) / float(count)
	var y := 1.0 - ratio * 2.0
	var radius := sqrt(maxf(0.0, 1.0 - y * y))
	var angle := float(index) * PI * (3.0 - sqrt(5.0))
	return Vector3(cos(angle) * radius, y, sin(angle) * radius)


static func _random01(index: int, salt: int) -> float:
	return fposmod(sin(float(index * 127 + salt * 311)) * 43758.5453, 1.0)


static func _create_tuft_mesh() -> ArrayMesh:
	var vertices := PackedVector3Array([
		Vector3(-0.50, 0.0, 0.0),
		Vector3(0.50, 0.0, 0.0),
		Vector3(0.35, 0.58, 0.0),
		Vector3(0.22, 1.0, 0.0),
		Vector3(-0.12, 0.58, 0.0),
		Vector3(0.0, 0.0, -0.50),
		Vector3(0.0, 0.0, 0.50),
		Vector3(0.0, 0.58, 0.35),
		Vector3(0.0, 1.0, 0.22),
		Vector3(0.0, 0.58, -0.12),
	])
	var normals := PackedVector3Array()
	for index in 5:
		normals.append(Vector3(0.0, 0.0, 1.0))
	for index in 5:
		normals.append(Vector3(1.0, 0.0, 0.0))
	var indices := PackedInt32Array([
		0, 1, 2,
		0, 2, 4,
		4, 2, 3,
		5, 6, 7,
		5, 7, 9,
		9, 7, 8,
	])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := StandardMaterial3D.new()
	material.albedo_color = PetConfigScript.BODY_COLOR
	material.roughness = 1.0
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.vertex_color_use_as_albedo = true
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.surface_set_material(0, material)
	return mesh
