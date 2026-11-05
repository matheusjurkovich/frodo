import type {Spring} from './spring.types.js';

export const SPRING: Spring = {damping: 0.58, ms: 560};
export const GENTLE_SPRING: Spring = {damping: 0.68, ms: 500};
export const SOFT_SPRING: Spring = {damping: 0.78, ms: 420};
export const FIRM_SPRING: Spring = {damping: 1, ms: 420};
export const PEAK_SAMPLES = 200;
