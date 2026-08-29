extends Node2D

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const DesktopWindowControllerScript = preload("res://scripts/desktop/desktop_window_controller.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")
const PetAnimatorScript = preload("res://scripts/pet/pet_animator.gd")
const PetInteractionScript = preload("res://scripts/pet/pet_interaction.gd")
const PetBridgeClientScript = preload("res://scripts/pet/pet_bridge_client.gd")


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

	var bridge := PetBridgeClientScript.new()
	bridge.name = "PetBridgeClient"
	add_child(bridge)
	var integrated := bridge.configure_from_environment()
	interaction.setup(window_controller, animator, visual, integrated)
	if integrated:
		bridge.state_changed.connect(animator.set_status)
		interaction.open_panel_requested.connect(bridge.post_event.bind("open_panel"))
		interaction.quit_requested.connect(bridge.post_event.bind("quit_requested"))
		interaction.menu_action_requested.connect(bridge.post_event)
		bridge.post_event("pet_ready")
