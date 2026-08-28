shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_never;

uniform float shadow_strength : hint_range(0.0, 1.0) = 0.72;


void fragment() {
	vec2 centered = (UV - vec2(0.5)) * 2.0;
	float distance_squared = dot(centered, centered);
	float fade = 1.0 - smoothstep(0.08, 1.0, distance_squared);
	ALBEDO = vec3(0.16, 0.20, 0.08);
	ALPHA = fade * 0.34 * shadow_strength;
}
