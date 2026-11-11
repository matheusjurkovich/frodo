import type {Axes} from './motion.types.js';

export const FADE_OUT_MS = 110;
export const FADE_OUT_SCALE = 0.96;
export const FADE_IN_MS = 220;
export const FADE_IN_DELAY_MS = 70;
export const FADE_IN_SCALE = 0.92;
export const ZOOM_DELAY_MS = 40;
export const SLIDE_PX = 56;
export const SLIDE_FADE_MS = 220;
export const REVEAL_IN_MS = 240;
export const REVEAL_IN_DELAY_MS = 80;
export const REVEAL_OUT_MS = 120;
export const BOTH_AXES: Axes = {width: true, height: true};
export const HEIGHT_AXIS: Axes = {width: false, height: true};
export const SPRING_KEYS = 24;
export const DOUBLE_PROPERTIES = new Set(['scale-x', 'scale-y', 'rotation-angle-z']);
export const FOLLOW_SAMPLE_FRAMES = 4;
