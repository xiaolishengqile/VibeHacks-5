shader_type canvas_item;
render_mode unshaded;

uniform float key_start = 0.18;
uniform float key_end = 0.72;

void fragment() {
	vec4 source = texture(TEXTURE, UV);
	float green_dominance = source.g - max(source.r, source.b);
	float key_strength = smoothstep(key_start, key_end, green_dominance);
	vec3 despilled = source.rgb;
	despilled.g = min(despilled.g, max(despilled.r, despilled.b) + 0.12);
	COLOR = vec4(mix(source.rgb, despilled, key_strength), source.a * (1.0 - key_strength));
}
