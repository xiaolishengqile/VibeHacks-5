class_name FurStrandBuilder
extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const STRAND_SHADER = preload("res://shaders/fur_strand.gdshader")

const GOLDEN_ANGLE := PI * (3.0 - sqrt(5.0))
const RANDOM_SEED := 20260828


static func create() -> MultiMeshInstance3D:
	var instance := MultiMeshInstance3D.new()
	instance.name = "FurStrands"

	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_custom_data = true
	multimesh.mesh = _strand_mesh()
	multimesh.instance_count = PetConfigScript.FUR_STRAND_COUNT

	var random := RandomNumberGenerator.new()
	random.seed = RANDOM_SEED
	var body_radii := Vector3(0.82, 0.82, 0.82) * PetConfigScript.BODY_SCALE
	for index in PetConfigScript.FUR_STRAND_COUNT:
		var direction := _fibonacci_direction(index, PetConfigScript.FUR_STRAND_COUNT)
		var surface_position := direction * body_radii
		var normal := Vector3(
			direction.x / body_radii.x,
			direction.y / body_radii.y,
			direction.z / body_radii.z,
		).normalized()
		var tangent := normal.cross(Vector3.UP)
		if tangent.length_squared() < 0.001:
			tangent = normal.cross(Vector3.RIGHT)
		tangent = tangent.normalized()
		var bitangent := tangent.cross(normal).normalized()
		var hair_direction := strand_direction(
			surface_position,
			normal,
			tangent,
			bitangent,
			random.randf_range(-0.035, 0.035),
			random.randf_range(-0.035, 0.035),
		)
		var width := PetConfigScript.FUR_STRAND_WIDTH * random.randf_range(0.68, 1.18)
		var length := PetConfigScript.FUR_STRAND_LENGTH * random.randf_range(0.70, 1.28)
		var basis := Basis(tangent * width, hair_direction * length, bitangent * width)
		multimesh.set_instance_transform(index, Transform3D(basis, surface_position))
		multimesh.set_instance_custom_data(
			index,
			Color(random.randf_range(0.82, 1.0), random.randf(), random.randf(), 1.0),
		)

	multimesh.custom_aabb = AABB(Vector3(-1.25, -0.95, -1.0), Vector3(2.5, 1.95, 2.0))
	instance.multimesh = multimesh
	var material := ShaderMaterial.new()
	material.shader = STRAND_SHADER
	material.set_shader_parameter("fur_color", PetConfigScript.BODY_COLOR)
	instance.material_override = material
	return instance


static func strand_direction(
	surface_position: Vector3,
	normal: Vector3,
	tangent: Vector3,
	bitangent: Vector3,
	tangent_jitter: float,
	bitangent_jitter: float,
) -> Vector3:
	var clump_angle := sin(
		surface_position.x * 7.0 + surface_position.y * 9.0 + surface_position.z * 5.0
	) * PI
	return (
		normal
		+ tangent * (cos(clump_angle) * 0.30 + tangent_jitter)
		+ bitangent * (sin(clump_angle) * 0.30 + bitangent_jitter)
	).normalized()


static func _fibonacci_direction(index: int, count: int) -> Vector3:
	var y := 1.0 - 2.0 * (float(index) + 0.5) / float(count)
	var horizontal_radius := sqrt(maxf(0.0, 1.0 - y * y))
	var angle := GOLDEN_ANGLE * float(index)
	return Vector3(cos(angle) * horizontal_radius, y, sin(angle) * horizontal_radius)


static func _strand_mesh() -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([
		Vector3(-0.5, 0.0, 0.0),
		Vector3(0.5, 0.0, 0.0),
		Vector3(0.0, 1.0, 0.0),
		Vector3(0.0, 0.0, -0.5),
		Vector3(0.0, 0.0, 0.5),
		Vector3(0.0, 1.0, 0.0),
	])
	arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([
		Vector2(0.0, 0.0),
		Vector2(1.0, 0.0),
		Vector2(0.5, 1.0),
		Vector2(0.0, 0.0),
		Vector2(1.0, 0.0),
		Vector2(0.5, 1.0),
	])
	arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([
		Vector3(0.0, 0.0, 1.0),
		Vector3(0.0, 0.0, 1.0),
		Vector3(0.0, 0.0, 1.0),
		Vector3(1.0, 0.0, 0.0),
		Vector3(1.0, 0.0, 0.0),
		Vector3(1.0, 0.0, 0.0),
	])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
