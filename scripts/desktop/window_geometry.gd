class_name WindowGeometry
extends RefCounted


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
