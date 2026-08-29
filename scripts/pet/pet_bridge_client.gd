class_name PetBridgeClient
extends Node

const PetStateScript = preload("res://scripts/pet/pet_state.gd")
const POLL_SECONDS := 0.5
const ALLOWED_EVENTS := [
	"open_panel",
	"open_workbench",
	"open_today",
	"open_input",
	"hide_pet",
	"quit_requested",
	"pet_ready",
]

signal state_changed(state: String)

var _port := 0
var _token := ""
var _poll_request: HTTPRequest
var _poll_timer: Timer
var _poll_in_flight := false


func configure_from_environment() -> bool:
	var port_text := OS.get_environment("STARTDAY_BRIDGE_PORT")
	var token := OS.get_environment("STARTDAY_BRIDGE_TOKEN")
	if not port_text.is_valid_int() or token.is_empty():
		return false
	return configure(port_text.to_int(), token)


func configure(port: int, token: String) -> bool:
	if port <= 0 or port > 65535 or token.is_empty() or is_integrated():
		return false
	_port = port
	_token = token

	_poll_request = HTTPRequest.new()
	_poll_request.timeout = 2.0
	_poll_request.request_completed.connect(_on_poll_completed)
	add_child(_poll_request)

	_poll_timer = Timer.new()
	_poll_timer.wait_time = POLL_SECONDS
	_poll_timer.timeout.connect(_poll_state)
	add_child(_poll_timer)
	_poll_timer.start()
	call_deferred("_poll_state")
	return true


func is_integrated() -> bool:
	return _port > 0 and not _token.is_empty()


func post_event(event_type: String) -> bool:
	if not is_integrated() or event_type not in ALLOWED_EVENTS:
		return false
	var event_request := HTTPRequest.new()
	event_request.timeout = 2.0
	event_request.request_completed.connect(func(
		_result: int,
		_response_code: int,
		_headers: PackedStringArray,
		_body: PackedByteArray,
	) -> void: event_request.queue_free())
	add_child(event_request)
	var headers := PackedStringArray([
		"Authorization: Bearer %s" % _token,
		"Content-Type: application/json",
	])
	var body := JSON.stringify({"type": event_type})
	var error := event_request.request(
		_base_url() + "/event",
		headers,
		HTTPClient.METHOD_POST,
		body,
	)
	if error != OK:
		event_request.queue_free()
	return error == OK


func _poll_state() -> void:
	if not is_integrated() or _poll_in_flight:
		return
	_poll_in_flight = true
	var error := _poll_request.request(
		_base_url() + "/state",
		PackedStringArray(["Authorization: Bearer %s" % _token]),
	)
	if error != OK:
		_poll_in_flight = false


func _on_poll_completed(
	_result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray,
) -> void:
	_poll_in_flight = false
	if response_code != 200:
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed is Dictionary:
		return
	var state := PetStateScript.normalize(parsed.get("state", "idle"))
	state_changed.emit(state)


func _base_url() -> String:
	return "http://127.0.0.1:%d" % _port
