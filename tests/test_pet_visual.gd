extends RefCounted

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const PetVisualScript = preload("res://scripts/pet/pet_visual.gd")


static func run() -> Array[String]:
	var errors: Array[String] = []
	var visual: Node = PetVisualScript.new()
	visual.call("build")

	if not visual is Node2D:
		errors.append("桌宠外观必须使用二维节点")
	var artwork := visual.get_node_or_null("Body/Artwork") as Sprite2D
	if artwork == null:
		errors.append("二维桌宠必须包含完整立绘")
		visual.free()
		return errors
	if artwork.texture == null:
		errors.append("二维桌宠必须加载猫咪素材")
	else:
		if artwork.texture.get_size() != Vector2(1254, 1254):
			errors.append("猫咪素材必须保留高分辨率细节")
		var displayed_size := artwork.texture.get_size() * artwork.scale
		if not is_equal_approx(displayed_size.x, 870.0):
			errors.append("猫咪立绘必须完整适配内部画布")
	var artwork_material := artwork.material as ShaderMaterial
	if artwork_material == null or artwork_material.shader == null:
		errors.append("二维素材必须使用透明键控材质")
	var peek_artwork := visual.get_node_or_null("Body/PeekArtwork") as Sprite2D
	if peek_artwork == null or peek_artwork.texture == null:
		errors.append("桌宠必须包含右侧探头立绘")
	else:
		if peek_artwork.texture.get_size() != Vector2(1254, 1254):
			errors.append("探头立绘必须保留高分辨率细节")
		var texture_scale := peek_artwork.scale.x
		var visible_right_edge := (
			Vector2(PetConfigScript.RENDER_SIZE).x * 0.5
			+ peek_artwork.position.x
			+ (PetVisualScript.PEEK_CONTENT_RIGHT_X - peek_artwork.texture.get_width() * 0.5)
			* texture_scale
		)
		if not is_equal_approx(visible_right_edge, float(PetConfigScript.RENDER_SIZE.x)):
			errors.append("探头立绘的抓握边缘必须贴齐窗口右侧")
		if peek_artwork.visible:
			errors.append("探头立绘默认必须隐藏")
		if peek_artwork.material == null:
			errors.append("探头立绘必须使用透明键控材质")
	var peek_toggle := visual.get_node_or_null("PeekToggle") as Button
	if peek_toggle == null:
		errors.append("桌宠必须提供手动探头按钮")
	elif not is_zero_approx(peek_toggle.modulate.a):
		errors.append("探头按钮默认必须隐藏并在悬停时出现")
	if not visual.find_children("*", "Node3D", true, false).is_empty():
		errors.append("二维桌宠不能保留三维节点")
	if not visual.has_method("set_body_pose"):
		errors.append("二维桌宠必须提供整体姿态接口")
		visual.free()
		return errors

	visual.call("set_body_pose", Vector2(1.05, 0.96), 8.0)
	var body := visual.get_node("Body") as Node2D
	if not body.scale.is_equal_approx(Vector2(1.05, 0.96)):
		errors.append("整体姿态缩放未应用到二维立绘")
	var expected_position := Vector2(PetConfigScript.RENDER_SIZE) * 0.5 + Vector2(0.0, 8.0)
	if not body.position.is_equal_approx(expected_position):
		errors.append("整体姿态位移未应用到二维立绘")

	visual.call("set_peek_mode", true)
	if artwork.visible or not peek_artwork.visible:
		errors.append("进入探头状态时必须切换到探头立绘")
	if not visual.call("is_peek_mode"):
		errors.append("桌宠必须记录当前探头状态")
	visual.call("set_peek_mode", false)
	if not artwork.visible or peek_artwork.visible:
		errors.append("退出探头状态时必须恢复完整立绘")

	visual.free()
	return errors
