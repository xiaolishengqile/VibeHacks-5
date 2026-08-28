extends SceneTree

const TESTS := [
	preload("res://tests/test_config.gd"),
	preload("res://tests/test_window_geometry.gd"),
	preload("res://tests/test_pet_visual.gd"),
	preload("res://tests/test_animation_math.gd"),
]


func _initialize() -> void:
	var errors: Array[String] = []
	for test_case in TESTS:
		if not test_case.can_instantiate():
			errors.append("测试脚本无法实例化：%s" % test_case.resource_path)
			continue
		errors.append_array(test_case.run())

	if errors.is_empty():
		print("全部测试通过")
		quit(0)
		return

	for error in errors:
		push_error(error)
	quit(1)
