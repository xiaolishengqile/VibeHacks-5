shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 fur_color : source_color = vec3(0.72, 0.82, 0.35);
uniform float shell_ratio : hint_range(0.0, 1.0) = 0.0;
uniform float fur_length : hint_range(0.0, 0.3) = 0.11;


float hash21(vec2 point) {
	point = fract(point * vec2(123.34, 456.21));
	point += dot(point, point + 45.32);
	return fract(point.x * point.y);
}


void vertex() {
	VERTEX += NORMAL * fur_length * shell_ratio;
	VERTEX.x += sin(TIME * 1.4 + VERTEX.y * 7.0) * 0.008 * shell_ratio;
}


void fragment() {
	float strand = hash21(floor(UV * vec2(260.0, 180.0)));
	if (shell_ratio > 0.0 && strand < shell_ratio * 0.82) {
		discard;
	}
	ALBEDO = fur_color * mix(0.72, 1.08, strand);
	ROUGHNESS = 0.92;
}
