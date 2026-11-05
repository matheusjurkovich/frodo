import type {Period} from './consumption.types.js';

export const KEPT_DAYS = 30;
export const PERIOD_DAYS: Record<Period, number> = {today: 1, '7d': 7, '30d': KEPT_DAYS};
export const MAX_PROJECTS = 4;
export const FIRST_HOUR = 8;
export const LAST_HOUR = 18;
export const LABEL_EVERY = 7;
export const MAX_HOUR_LABELS = 12;
