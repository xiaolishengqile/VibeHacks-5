extends Node3D

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const PetAnimatorScript = preload("res://scripts/pet/pet_animator.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")


func _ready() -> void:
	Engine.max_fps = PetConfigScript.TARGET_FPS
	var window_controller = DesktopWindowControllerScript.new()
	window_controller.configure(get_window())

	var visual := PetVisualScript.new()
	visual.name = "PetVisual"
	add_child(visual)
	visual.build()

	var animator := PetAnimatorScript.new()
	animator.name = "PetAnimator"
	add_child(animator)
	animator.setup(visual)

	var interaction := PetInteractionScript.new()
	interaction.name = "PetInteraction"
	add_child(interaction)
	interaction.setup(window_controller, animator)

	_add_camera_and_lights()


func _add_camera_and_lights() -> void:
	var camera := Camera3D.new()
	camera.name = "Camera"
	camera.position = Vector3(0.0, 0.0, 3.85)
	camera.fov = 38.0
	add_child(camera)

	var key_light := OmniLight3D.new()
	key_light.name = "KeyLight"
	key_light.position = Vector3(-1.8, 2.2, 2.8)
	key_light.light_color = Color("fffdf4")
	key_light.light_energy = 3.3
	key_light.omni_range = 7.0
	add_child(key_light)

	var fill_light := OmniLight3D.new()
	fill_light.name = "FillLight"
	fill_light.position = Vector3(2.2, 0.4, 2.4)
	fill_light.light_color = Color("eef5e8")
	fill_light.light_energy = 1.6
	fill_light.omni_range = 6.0
	add_child(fill_light)

	var soft_light := OmniLight3D.new()
	soft_light.name = "SoftLight"
	soft_light.position = Vector3(0.0, -1.6, 2.8)
	soft_light.light_color = Color("fffdf7")
	soft_light.light_energy = 0.9
	soft_light.omni_range = 5.0
	add_child(soft_light)

	var rim_light := DirectionalLight3D.new()
	rim_light.name = "RimLight"
	rim_light.rotation_degrees = Vector3(-22.0, 148.0, 0.0)
	rim_light.light_color = Color("f3ffbd")
	rim_light.light_energy = 0.50
	add_child(rim_light)
