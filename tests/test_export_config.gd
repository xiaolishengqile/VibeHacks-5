extends RefCounted


static func run() -> Array[String]:
	var errors: Array[String] = []
	if not FileAccess.file_exists("res://export_presets.cfg"):
		errors.append("必须提供苹果应用导出配置")
		return errors
	if not FileAccess.file_exists("res://scripts/export.command"):
		errors.append("必须提供一键导出脚本")
		return errors

	var preset := FileAccess.get_file_as_string("res://export_presets.cfg")
	if preset.find('binary_format/architecture="universal"') < 0:
		errors.append("导出配置必须使用官方通用架构模板")
	if preset.find('application/bundle_identifier="com.vibehacks.fuzzypet"') < 0:
		errors.append("导出配置必须包含稳定的应用标识")
	if preset.find("codesign/codesign=1") < 0:
		errors.append("导出配置必须使用本地临时签名")
	if preset.find('exclude_filter="artifacts/*,build/*,docs/*,tests/*"') < 0:
		errors.append("导出配置必须排除截图、构建、文档和测试文件")
	return errors
