import type {PanelSide, SystemIndicatorName} from './shell-internals.types.js';

export const EDGE_PRESSURE = 100;
export const EDGE_TIMEOUT_MS = 1000;

export const NATIVE_INDICATORS: readonly string[] = [
    'activities',
    'quickSettings',
    'dateMenu',
    'a11y',
    'keyboard',
    'dwellClick',
    'screenRecording',
    'screenSharing',
];

export const PANEL_SIDES: readonly PanelSide[] = ['left', 'center', 'right'];

export const SYSTEM_INDICATOR_FIELDS: Record<SystemIndicatorName, string> = {
    bluetooth: '_bluetooth',
    volume: '_volumeOutput',
    microphone: '_volumeInput',
    'do-not-disturb': '_doNotDisturb',
    battery: '_system',
};

export const OWN_INDICATOR_FIELDS: readonly string[] = [...Object.values(SYSTEM_INDICATOR_FIELDS), '_network'];
export const WEEK = 7;
export const MONTH_HEADER = '%OB %Y';
