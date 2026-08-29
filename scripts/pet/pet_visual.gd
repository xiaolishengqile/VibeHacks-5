class_name PetVisual
extends Node2D

signal peek_toggle_requested

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const ARTWORK_TEXTURE = preload("res://assets/pet/crystal_cat_2d.png")
const PEEK_ARTWORK_TEXTURE = preload("res://assets/pet/crystal_cat_peek_2d.png")
const CHROMA_KEY_SHADER = preload("res://shaders/chroma_key.gdshader")
const ARTWORK_SIZE := 870.0

var _body_root: Node2D
var _artwork: Sprite2D
var _peek_artwork: Sprite2D
var _peek_mode := false


func build() -> void:
	if _body_root != null:
		return
	_body_root = Node2D.new()
	_body_root.name = "Body"
	_body_root.position = Vector2(PetConfigScript.RENDER_SIZE) * 0.5
	add_child(_body_root)

	_artwork = _create_artwork("Artwork", ARTWORK_TEXTURE)
	_body_root.add_child(_artwork)
	_peek_artwork = _create_artwork("PeekArtwork", PEEK_ARTWORK_TEXTURE)
	_peek_artwork.visible = false
	_body_root.add_child(_peek_artwork)

	var toggle := Button.new()
	toggle.name = "PeekToggle"
	toggle.text = "↔"
	toggle.tooltip_text = "切换探头状态"
	toggle.position = Vector2(260.0, 80.0)
	toggle.size = Vector2(150.0, 150.0)
	toggle.flat = true
	toggle.focus_mode = Control.FOCUS_NONE
	toggle.add_theme_font_size_override("font_size", 78)
	toggle.modulate.a = 0.0
	toggle.mouse_entered.connect(func() -> void: toggle.modulate.a = 1.0)
	toggle.mouse_exited.connect(func() -> void: toggle.modulate.a = 0.0)
	toggle.pressed.connect(func() -> void: peek_toggle_requested.emit())
	add_child(toggle)


func _create_artwork(node_name: String, texture: Texture2D) -> Sprite2D:
	var artwork := Sprite2D.new()
	artwork.name = node_name
	artwork.texture = texture
	artwork.scale = Vector2.ONE * ARTWORK_SIZE / texture.get_width()
	var material := ShaderMaterial.new()
	material.shader = CHROMA_KEY_SHADER
	artwork.material = material
	return artwork


func set_body_pose(scale_factor: Vector2, y_offset: float) -> void:
	_body_root.scale = scale_factor
	_body_root.position = Vector2(PetConfigScript.RENDER_SIZE) * 0.5 + Vector2(0.0, y_offset)


func set_peek_mode(enabled: bool) -> void:
	_peek_mode = enabled
	_artwork.visible = not enabled
	_peek_artwork.visible = enabled


func is_peek_mode() -> bool:
	return _peek_mode
