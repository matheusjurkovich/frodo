import type {Rect} from '../../shared/geometry.js';

export const WINDOW_COLOR_SLOTS = 6;
const SUMMARY_VISIBLE_APPS = 2;

export function thumbnailRects(windows: readonly Rect[], area: Rect, width: number, height: number): Rect[] {
    const scaleX = width / area.width;
    const scaleY = height / area.height;
    const rects: Rect[] = [];
    for (const window of windows) {
        const left = Math.max(window.x, area.x);
        const top = Math.max(window.y, area.y);
        const right = Math.min(window.x + window.width, area.x + area.width);
        const bottom = Math.min(window.y + window.height, area.y + area.height);
        if (right <= left || bottom <= top) continue;
        const x = Math.round((left - area.x) * scaleX);
        const y = Math.round((top - area.y) * scaleY);
        rects.push({
            x,
            y,
            width: Math.round((right - area.x) * scaleX) - x,
            height: Math.round((bottom - area.y) * scaleY) - y,
        });
    }
    return rects;
}

export function workspaceTitle(name: string | undefined, appNames: readonly string[], index: number): string {
    const custom = name?.trim() ?? '';
    if (custom !== '') return custom;
    return appNames[0] ?? `Área ${index + 1}`;
}

export function appsSummary(appNames: readonly string[]): string {
    const apps = [...new Set(appNames)];
    if (apps.length === 0) return 'Vazia';
    const shown = apps.slice(0, SUMMARY_VISIBLE_APPS).join(', ');
    const hidden = apps.length - SUMMARY_VISIBLE_APPS;
    return hidden > 0 ? `${shown} +${hidden}` : shown;
}

export function colorSlot(appId: string, slots: number): number {
    let hash = 0;
    for (const char of appId) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    return hash % slots;
}
