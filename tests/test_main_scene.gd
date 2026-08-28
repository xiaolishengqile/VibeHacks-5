extends RefCounted


static func run() -> Array[String]:
	var errors: Array[String] = []
	var scene_path := "res://scenes/main.tscn"
	if not ResourceLoader.exists(scene_path):
		errors.append("主场景必须存在并可加载")
		return errors

	var packed_scene := load(scene_path) as PackedScene
	var scene := packed_scene.instantiate()
	var tree := Engine.get_main_loop() as SceneTree
	tree.root.add_child(scene)
	for node_name in ["PetVisual", "PetAnimator", "PetInteraction"]:
		if scene.get_node_or_null(node_name) == null:
			errors.append("主场景缺少模块：%s" % node_name)
	scene.free()
	return errors
