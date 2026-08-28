extends SceneTree

const TESTS := [
	preload("res://tests/test_config.gd"),
]


func _initialize() -> void:
	var errors: Array[String] = []
	for test_case in TESTS:
		errors.append_array(test_case.run())

	if errors.is_empty():
		print("全部测试通过")
		quit(0)
		return

	for error in errors:
		push_error(error)
	quit(1)
