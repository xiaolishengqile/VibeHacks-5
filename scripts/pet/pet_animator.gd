class_name PetAnimator
extends Node

const PetConfigScript = preload("res://scripts/config/pet_config.gd")
const BLINK_DURATION := 0.16
const REACTION_DURATION := 0.35

var _visual: Node3D
var _elapsed := 0.0
var _blink_elapsed := -1.0
var _time_until_blink := 2.8
var _reaction_elapsed := REACTION_DURATION
var _mouse_position := Vector2(120, 105)
var _random := RandomNumberGenerator.new()


func setup(visual: Node3D) -> void:
	_visual = visual
	_random.randomize()
	_time_until_blink = _random.randf_range(2.2, 5.0)
	set_process(true)


func set_mouse_position(position: Vector2) -> void:
	_mouse_position = position


func react() -> void:
	_reaction_elapsed = 0.0


static func gaze_offset(mouse: Vector2, viewport: Vector2) -> Vector2:
	var normalized := (mouse - viewport * 0.5) / (viewport * 0.5)
	return normalized.clamp(Vector2(-1.0, -1.0), Vector2(1.0, 1.0)) * 0.07


static func blink_openness(progress: float) -> float:
	if progress < 0.0 or progress > 1.0:
		return 1.0
	return absf(progress * 2.0 - 1.0)


func _process(delta: float) -> void:
	if _visual == null:
		return

	_elapsed += delta
	_update_blink(delta)
	_reaction_elapsed = minf(_reaction_elapsed + delta, REACTION_DURATION)

	var breathing := sin(_elapsed * 2.0) * 0.025
	var idle_y := sin(_elapsed * 1.5) * 0.025
	var reaction_progress := _reaction_elapsed / REACTION_DURATION
	var reaction := sin(reaction_progress * PI) * 0.09
	var pose_scale := Vector3(
		1.0 + breathing - reaction * 0.20,
		1.0 - breathing * 0.45 + reaction,
		1.0 + breathing,
	)
	_visual.set_body_pose(pose_scale, idle_y + reaction * 0.16)
	_visual.set_gaze(gaze_offset(_mouse_position, Vector2(PetConfigScript.WINDOW_SIZE)))
	_visual.set_shadow(1.0 - reaction * 2.2)


func _update_blink(delta: float) -> void:
	if _blink_elapsed >= 0.0:
		_blink_elapsed += delta
		_visual.set_blink(blink_openness(_blink_elapsed / BLINK_DURATION))
		if _blink_elapsed >= BLINK_DURATION:
			_blink_elapsed = -1.0
			_time_until_blink = _random.randf_range(2.2, 5.0)
		return

	_time_until_blink -= delta
	_visual.set_blink(1.0)
	if _time_until_blink <= 0.0:
		_blink_elapsed = 0.0
