shader_type spatial;
render_mode cull_disabled, unshaded, depth_draw_opaque;

uniform vec3 fur_color : source_color = vec3(0.85, 0.91, 0.47);

varying float strand_tone;
varying float strand_phase;


void vertex() {
	strand_tone = INSTANCE_CUSTOM.x;
	strand_phase = INSTANCE_CUSTOM.y * 6.283185;
	VERTEX.x += sin(TIME * 1.1 + strand_phase) * UV.y * UV.y * 0.045;
}


void fragment() {
	float root_to_tip = smoothstep(0.0, 1.0, UV.y);
	float tone = mix(0.86, 1.08, strand_tone);
	ALBEDO = fur_color * mix(0.76, 1.18, root_to_tip) * tone;
	ROUGHNESS = 0.98;
}
