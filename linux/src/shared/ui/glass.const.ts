export const BLUR_RADIUS = 40;
export const MARGIN = BLUR_RADIUS;
export const BRIGHTNESS = 0.6;

export const MASK_DECLARATIONS = `
uniform vec2 size;
uniform float margin;
uniform float radius;
`;

export const MASK_CODE = `
vec2 point = abs(cogl_tex_coord_in[0].xy * size - size * 0.5) - (size * 0.5 - vec2(margin)) + vec2(radius);
float distance = length(max(point, vec2(0.0))) + min(max(point.x, point.y), 0.0) - radius;
cogl_color_out *= 1.0 - smoothstep(-0.5, 0.5, distance);
`;
