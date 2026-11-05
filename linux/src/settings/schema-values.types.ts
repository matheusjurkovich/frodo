import type {
    CLOSED_MODES,
    CLOSED_ITEMS,
    PILL_POSITIONS,
    MONITOR_MODES,
    PILL_AI_ACTIVITIES,
    SURFACE_STYLES,
    TAB_IDS,
    CARD_IDS,
} from './schema-values.const.js';

export type ClosedMode = (typeof CLOSED_MODES)[number];
export type ClosedItem = (typeof CLOSED_ITEMS)[number];
export type PillPosition = (typeof PILL_POSITIONS)[number];
export type HorizontalPosition = 'left' | 'center' | 'right';
export type MonitorMode = (typeof MONITOR_MODES)[number];
export type PillAiActivity = (typeof PILL_AI_ACTIVITIES)[number];
export type SurfaceStyle = (typeof SURFACE_STYLES)[number];
export type TabId = (typeof TAB_IDS)[number];
export type CardId = (typeof CARD_IDS)[number];
