import type {VolumeLevel} from './volume-level.types.js';

export function volumeLevel(percent: number): VolumeLevel {
    if (percent <= 0) return 'muted';
    if (percent < 34) return 'low';
    return percent < 67 ? 'medium' : 'high';
}
