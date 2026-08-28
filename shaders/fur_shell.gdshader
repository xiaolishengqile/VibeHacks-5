shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec3 fur_color : source_color = vec3(0.72, 0.82, 0.35);
uniform sampler2D fur_texture : source_color, repeat_enable, filter_linear_mipmap;
uniform float shell_ratio : hint_range(0.0, 1.0) = 0.0;
uniform float fur_length : hint_range(0.0, 0.3) = 0.075;

varying vec3 fur_position;


float hash31(vec3 point) {
	point = fract(point * vec3(0.1031, 0.1030, 0.0973));
	point += dot(point, point.yzx + 33.33);
	return fract((point.x + point.y) * point.z);
}


float value_noise(vec3 point) {
	vec3 cell = floor(point);
	vec3 local = fract(point);
	local = local * local * (3.0 - 2.0 * local);
	float x00 = mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), local.x);
	float x10 = mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), local.x);
	float x01 = mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), local.x);
	float x11 = mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0, 1.0, 1.0)), local.x);
	float y0 = mix(x00, x10, local.y);
	float y1 = mix(x01, x11, local.y);
	return mix(y0, y1, local.z);
}


void vertex() {
	fur_position = VERTEX;
	float tuft_length = mix(0.72, 1.28, value_noise(VERTEX * 7.0));
	VERTEX += NORMAL * fur_length * shell_ratio * tuft_length;
	VERTEX.x += sin(TIME * 1.15 + VERTEX.y * 8.0) * 0.004 * shell_ratio;
}


void fragment() {
	float fine_strand = hash31(floor(fur_position * 460.0));
	float soft_clump = value_noise(fur_position * 18.0);
	float strand = mix(fine_strand, soft_clump, 0.20);
	float density_threshold = pow(shell_ratio, 2.6) * 0.82;
	if (shell_ratio > 0.0 && strand < density_threshold) {
		discard;
	}
	float tuft_tone = value_noise(fur_position * 10.0);
	vec3 plush_sample = texture(fur_texture, UV * vec2(1.8, 1.35)).rgb;
	vec3 plush_detail = clamp((plush_sample - vec3(0.5)) * 1.42 + vec3(0.5), vec3(0.0), vec3(1.0));
	vec3 textured_color = mix(fur_color, plush_detail, 0.84);
	ALBEDO = textured_color * mix(0.84, 1.08, shell_ratio) * mix(0.92, 1.07, tuft_tone);
	ROUGHNESS = 0.96;
}
