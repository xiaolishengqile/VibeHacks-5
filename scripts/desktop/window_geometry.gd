class_name WindowGeometry
extends RefCounted


static func physical_window_size(logical_size: Vector2i, screen_scale: float) -> Vector2i:
	var scale := maxf(screen_scale, 1.0)
	return Vector2i(
		roundi(float(logical_size.x) * scale),
		roundi(float(logical_size.y) * scale),
	)


static func bottom_right_position(
	usable_rect: Rect2i,
	physical_size: Vector2i,
	margin: Vector2i,
	screen_scale: float,
) -> Vector2i:
	return usable_rect.end - physical_size - physical_window_size(margin, screen_scale)


static func is_near_right_edge(
	window_rect: Rect2i,
	usable_rect: Rect2i,
	threshold: int,
) -> bool:
	var distance := usable_rect.end.x - window_rect.end.x
	return absi(distance) <= maxi(threshold, 0)


static func ellipse_polygon(
	size: Vector2i,
	center: Vector2,
	radii: Vector2,
	point_count: int = 32,
) -> PackedVector2Array:
	var points := PackedVector2Array()
	for index in point_count:
		var angle := TAU * float(index) / float(point_count)
		var point := center + Vector2(cos(angle) * radii.x, sin(angle) * radii.y)
		points.append(point.clamp(Vector2.ZERO, Vector2(size)))
	return points
