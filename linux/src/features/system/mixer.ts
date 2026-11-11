import {GENERIC_DETAILS} from './mixer.const.js';
import type {AudioStream} from './mixer.types.js';

export function streamDetail(description: string | null): string | null {
    const text = description?.trim() ?? '';
    return text === '' || GENERIC_DETAILS.has(text.toLowerCase()) ? null : text;
}

export function levelOf(volume: number, max: number): number {
    return max > 0 ? Math.min(1, Math.max(0, volume / max)) : 0;
}

export function volumeLabel(stream: Pick<AudioStream, 'level' | 'muted'>): string {
    return stream.muted ? 'Mudo' : `${Math.round(stream.level * 100)}%`;
}

export function playingSummary(apps: readonly Pick<AudioStream, 'muted'>[]): string {
    const playing = apps.filter(app => !app.muted).length;
    if (playing === 0) return apps.length === 0 ? 'Nenhum app com som' : 'Tudo silenciado';
    return `${playing} tocando agora`;
}

export function sameStreams(a: readonly Pick<AudioStream, 'id'>[], b: readonly Pick<AudioStream, 'id'>[]): boolean {
    return a.length === b.length && a.every((stream, index) => stream.id === b[index]?.id);
}

export function levelChange(level: number, max: number, muted: boolean): {volume: number; mute: boolean | null} {
    const volume = Math.round(Math.min(1, Math.max(0, level)) * max);
    if (volume < 1 && !muted) return {volume, mute: true};
    if (volume >= 1 && muted) return {volume, mute: false};
    return {volume, mute: null};
}
