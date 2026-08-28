class_name PetState
extends RefCounted

const STATES := [
	"idle",
	"urgent",
	"thinking",
	"awaiting_approval",
	"executing",
	"completed",
	"failed",
]

const PARAMETERS := {
	"idle": {"speed": 1.0, "breath": 1.0, "float": 1.0, "lift": 0.0},
	"urgent": {"speed": 1.55, "breath": 1.35, "float": 1.15, "lift": 0.015},
	"thinking": {"speed": 0.72, "breath": 0.75, "float": 0.55, "lift": 0.01},
	"awaiting_approval": {"speed": 1.25, "breath": 1.45, "float": 0.65, "lift": 0.025},
	"executing": {"speed": 1.8, "breath": 1.2, "float": 1.35, "lift": 0.02},
	"completed": {"speed": 1.35, "breath": 1.25, "float": 1.1, "lift": 0.03},
	"failed": {"speed": 0.48, "breath": 0.55, "float": 0.35, "lift": -0.035},
}


static func normalize(value: Variant) -> String:
	if value is String and value in STATES:
		return value
	return "idle"


static func animation_parameters(value: Variant) -> Dictionary:
	return PARAMETERS[normalize(value)]
