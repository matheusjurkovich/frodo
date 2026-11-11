import {BAR_MIN, BAR_FULL} from './geometry.const.js';
import type {HorizontalAlign, Rect, EdgeSpan} from './geometry.types.js';

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
}

export function alignX(align: HorizontalAlign, width: number, monX: number, monW: number, margin = 0): number {
    if (align === 'left') return monX + margin;
    if (align === 'right') return monX + monW - width - margin;
    return monX + Math.round((monW - width) / 2);
}

export function anchorCenter(align: HorizontalAlign, span: {x: number; width: number}, anchorX: number, anchorW: number): number {
    return align === 'center' ? span.x + span.width / 2 : anchorX + anchorW / 2;
}

export function centerClamp(pillX: number, pillW: number, panelW: number, monX: number, monW: number, margin = 8): number {
    const x = Math.round(pillX + pillW / 2 - panelW / 2);
    return clamp(x, monX + margin, monX + monW - panelW - margin);
}

export function topEdgeSpan(monitor: Rect, monitors: readonly Rect[], span: number, align: HorizontalAlign = 'center'): EdgeSpan | null {
    const width = Math.min(span, monitor.width);
    const x1 = alignX(align, width, monitor.x, monitor.width);
    const x2 = x1 + width;
    const covered = monitors.some(other => other.y + other.height === monitor.y && other.x < x2 && other.x + other.width > x1);
    return covered ? null : {x1, x2, y: monitor.y};
}

export function segmentWidths(fractions: readonly number[], width: number): number[] {
    let total = 0;
    let previousEdge = 0;
    return fractions.map(fraction => {
        total = Math.min(1, total + clamp(fraction, 0, 1));
        const edge = Math.round(total * width);
        const segment = edge - previousEdge;
        previousEdge = edge;
        return segment;
    });
}

export function barHeight(value: number, max: number, future: boolean): number {
    return future || max <= 0 ? BAR_MIN : Math.max(BAR_MIN, Math.round((value / max) * BAR_FULL));
}
