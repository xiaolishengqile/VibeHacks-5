class_name PetVisual
extends Node3D

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const FurStrandBuilderScript = preload("res://scripts/pet/fur_strand_builder.gd")
const FUR_SHADER = preload("res://shaders/fur_shell.gdshader")
const FUR_TEXTURE = preload("res://assets/textures/fur_plush.png")
const SHADOW_SHADER = preload("res://shaders/shadow.gdshader")

var _body_root: Node3D
var _eyes_root: Node3D
var _left_eye: Node3D
var _right_eye: Node3D
var _left_gaze: Node3D
var _right_gaze: Node3D
var _shadow: MeshInstance3D
var _shadow_material: ShaderMaterial


func build() -> void:
	if _body_root != null:
		return
	_build_body()
	_build_eyes()
	_build_shadow()


func set_body_pose(scale_factor: Vector3, y_offset: float) -> void:
	_body_root.scale = scale_factor
	_body_root.position.y = y_offset
	_eyes_root.scale = scale_factor
	_eyes_root.position.y = y_offset


func set_blink(openness: float) -> void:
	var eye_scale_y := maxf(0.08, openness)
	_left_eye.scale.y = eye_scale_y
	_right_eye.scale.y = eye_scale_y


func set_gaze(offset: Vector2) -> void:
	var gaze_position := Vector3(offset.x, offset.y, 0.0)
	_left_gaze.position = gaze_position
	_right_gaze.position = gaze_position


func set_shadow(strength: float) -> void:
	var clamped_strength := clampf(strength, 0.0, 1.0)
	_shadow_material.set_shader_parameter("shadow_strength", clamped_strength)
	_shadow.scale.x = lerpf(0.88, 1.04, clamped_strength)


func _build_body() -> void:
	_body_root = Node3D.new()
	_body_root.name = "Body"
	_body_root.position.y = -0.03
	add_child(_body_root)

	var body_mesh := SphereMesh.new()
	body_mesh.radius = 0.82
	body_mesh.height = 1.64
	body_mesh.radial_segments = PetConfigScript.FUR_RADIAL_SEGMENTS
	body_mesh.rings = PetConfigScript.FUR_RINGS

	var base := MeshInstance3D.new()
	base.name = "Base"
	base.mesh = body_mesh
	base.scale = PetConfigScript.BODY_SCALE
	base.material_override = _solid_material(PetConfigScript.BODY_COLOR.darkened(0.10), 0.95)
	_body_root.add_child(base)

	var shells := Node3D.new()
	shells.name = "FurShells"
	_body_root.add_child(shells)
	for index in PetConfigScript.FUR_SHELL_COUNT:
		var shell := MeshInstance3D.new()
		shell.name = "Shell%02d" % index
		shell.mesh = body_mesh
		shell.scale = PetConfigScript.BODY_SCALE
		var material := ShaderMaterial.new()
		material.shader = FUR_SHADER
		material.set_shader_parameter(
			"shell_ratio",
			float(index) / float(PetConfigScript.FUR_SHELL_COUNT - 1),
		)
		material.set_shader_parameter("fur_color", PetConfigScript.BODY_COLOR)
		material.set_shader_parameter("fur_length", PetConfigScript.FUR_LENGTH)
		material.set_shader_parameter("fur_texture", FUR_TEXTURE)
		shell.material_override = material
		shells.add_child(shell)

	_body_root.add_child(FurStrandBuilderScript.create())


func _build_eyes() -> void:
	_eyes_root = Node3D.new()
	_eyes_root.name = "Eyes"
	add_child(_eyes_root)

	var left := _create_eye("Left", Vector3(-0.31, 0.14, 0.72))
	_left_eye = left.eye
	_left_gaze = left.gaze
	var right := _create_eye("Right", Vector3(0.31, 0.14, 0.72))
	_right_eye = right.eye
	_right_gaze = right.gaze


func _create_eye(eye_name: String, eye_position: Vector3) -> Dictionary:
	var eye := Node3D.new()
	eye.name = eye_name
	eye.position = eye_position
	_eyes_root.add_child(eye)

	var white := _sphere("EyeWhite", 0.235, Color("e9f5d9"), 0.24)
	white.scale.z = 0.78
	eye.add_child(white)

	var gaze := Node3D.new()
	gaze.name = "Gaze"
	eye.add_child(gaze)

	var iris := _sphere("Iris", 0.145, Color("18c94f"), 0.20)
	iris.position.z = 0.175
	iris.scale.z = 0.36
	gaze.add_child(iris)

	var pupil := _sphere("Pupil", 0.075, Color("002d12"), 0.16)
	pupil.position.z = 0.242
	pupil.scale.z = 0.28
	gaze.add_child(pupil)

	var highlight_large := _sphere("HighlightLarge", 0.032, Color.WHITE, 0.10, true)
	highlight_large.position = Vector3(-0.055, 0.065, 0.294)
	gaze.add_child(highlight_large)

	var highlight_small := _sphere("HighlightSmall", 0.018, Color.WHITE, 0.10, true)
	highlight_small.position = Vector3(0.035, 0.025, 0.296)
	gaze.add_child(highlight_small)

	var cornea := _sphere("Cornea", 0.242, Color(0.78, 1.0, 0.86, 0.12), 0.04)
	var cornea_material := cornea.material_override as StandardMaterial3D
	cornea_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cornea_material.metallic = 0.12
	cornea.scale.z = 0.80
	eye.add_child(cornea)

	return {"eye": eye, "gaze": gaze}


func _build_shadow() -> void:
	_shadow = MeshInstance3D.new()
	_shadow.name = "Shadow"
	var mesh := QuadMesh.new()
	mesh.size = Vector2(2.25, 0.50)
	_shadow.mesh = mesh
	_shadow.position = Vector3(0.0, -0.79, -0.42)
	_shadow_material = ShaderMaterial.new()
	_shadow_material.shader = SHADOW_SHADER
	_shadow.material_override = _shadow_material
	add_child(_shadow)


func _sphere(
	node_name: String,
	radius: float,
	color: Color,
	roughness: float,
	unshaded: bool = false,
) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 32
	mesh.rings = 16
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.material_override = _solid_material(color, roughness, unshaded)
	return instance


func _solid_material(color: Color, roughness: float, unshaded: bool = false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	if unshaded:
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return material
