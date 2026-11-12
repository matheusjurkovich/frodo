import {percentLabel} from '../../shared/format.js';
import {clamp} from '../../shared/geometry.js';
import {GENERIC_DETAILS} from './mixer.const.js';
import type {AudioStream} from './mixer.types.js';

export function streamDetail(description: string | null): string | null {
    const text = description?.trim() ?? '';
    return text === '' || GENERIC_DETAILS.has(text.toLowerCase()) ? null : text;
}

export function levelOf(volume: number, max: number): number {
    return max > 0 ? clamp(volume / max, 0, 1) : 0;
}

export function volumeLabel(stream: Pick<AudioStream, 'level' | 'muted'>): string {
    return stream.muted ? 'Mudo' : percentLabel(stream.level * 100);
}

export function playingSummary(apps: readonly Pick<AudioStream, 'muted'>[]): string {
    const playing = apps.filter(app => !app.muted).length;
    if (playing === 0) return apps.length === 0 ? 'Nenhum app com som' : 'Tudo silenciado';
    return `${playing} tocando agora`;
}

export function levelChange(level: number, max: number, muted: boolean): {volume: number; mute: boolean | null} {
    const volume = Math.round(clamp(level, 0, 1) * max);
    if (volume < 1 && !muted) return {volume, mute: true};
    if (volume >= 1 && muted) return {volume, mute: false};
    return {volume, mute: null};
}
