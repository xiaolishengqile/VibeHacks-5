class_name HatBuilder
extends RefCounted

const HAT_COLOR := Color("bda7e8")
const HAT_SHADOW_COLOR := Color("967dc7")


static func create() -> Node3D:
	var hat := Node3D.new()
	hat.name = "Hat"
	hat.position = Vector3(0.12, 0.72, 0.04)
	hat.rotation_degrees = Vector3(-8.0, 0.0, -10.0)

	var brim_mesh := CylinderMesh.new()
	brim_mesh.top_radius = 0.38
	brim_mesh.bottom_radius = 0.35
	brim_mesh.height = 0.075
	brim_mesh.radial_segments = 48
	var brim := _mesh_instance("Brim", brim_mesh, HAT_SHADOW_COLOR)
	brim.position.y = 0.02
	brim.scale.z = 0.82
	hat.add_child(brim)

	var crown_mesh := SphereMesh.new()
	crown_mesh.radius = 0.44
	crown_mesh.height = 0.40
	crown_mesh.radial_segments = 48
	crown_mesh.rings = 24
	var crown := _mesh_instance("Crown", crown_mesh, HAT_COLOR)
	crown.position.y = 0.14
	crown.scale.z = 0.82
	hat.add_child(crown)

	var knot_mesh := SphereMesh.new()
	knot_mesh.radius = 0.07
	knot_mesh.height = 0.12
	knot_mesh.radial_segments = 24
	knot_mesh.rings = 12
	var top_knot := _mesh_instance("TopKnot", knot_mesh, HAT_SHADOW_COLOR)
	top_knot.position = Vector3(-0.02, 0.36, 0.0)
	top_knot.rotation_degrees.z = -12.0
	hat.add_child(top_knot)

	return hat


static func _mesh_instance(
	node_name: String,
	mesh: PrimitiveMesh,
	color: Color,
) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.92
	instance.material_override = material
	return instance
