class_name PetAnimator
extends Node

const PetStateScript = preload("res://scripts/pet/pet_state.gd")
const REACTION_DURATION := 0.35

var _visual: Node2D
var _elapsed := 0.0
var _reaction_elapsed := REACTION_DURATION
var _status := "idle"


func setup(visual: Node2D) -> void:
	_visual = visual
	set_process(true)


func react() -> void:
	_reaction_elapsed = 0.0


func set_status(status: String) -> void:
	var normalized := PetStateScript.normalize(status)
	if normalized == "completed" and normalized != _status:
		react()
	_status = normalized


func _process(delta: float) -> void:
	if _visual == null:
		return

	var parameters := PetStateScript.animation_parameters(_status)
	_elapsed += delta * float(parameters.speed)
	_reaction_elapsed = minf(_reaction_elapsed + delta, REACTION_DURATION)

	var breathing := sin(_elapsed * 2.0) * 0.012 * float(parameters.breath)
	var idle_y := sin(_elapsed * 1.5) * 4.0 * float(parameters.float)
	idle_y += float(parameters.lift) * 120.0
	var reaction_progress := _reaction_elapsed / REACTION_DURATION
	var reaction := sin(reaction_progress * PI) * 0.08
	var pose_scale := Vector2(
		1.0 + breathing - reaction * 0.20,
		1.0 - breathing * 0.45 + reaction,
	)
	_visual.set_body_pose(pose_scale, idle_y - reaction * 24.0)
