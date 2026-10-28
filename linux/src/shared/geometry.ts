export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface EdgeSpan {
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
}

export type HorizontalAlign = 'center' | 'left' | 'right';

export function alignX(align: HorizontalAlign, width: number, monX: number, monW: number, margin = 0): number {
    if (align === 'left') return monX + margin;
    if (align === 'right') return monX + monW - width - margin;
    return monX + Math.round((monW - width) / 2);
}

export function centerClamp(pillX: number, pillW: number, panelW: number, monX: number, monW: number, margin = 8): number {
    const x = Math.round(pillX + pillW / 2 - panelW / 2);
    return Math.max(monX + margin, Math.min(x, monX + monW - panelW - margin));
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
        total = Math.min(1, total + Math.min(1, Math.max(0, fraction)));
        const edge = Math.round(total * width);
        const segment = edge - previousEdge;
        previousEdge = edge;
        return segment;
    });
}

const BAR_FULL = 64;
const BAR_MIN = 3;

export function barHeight(value: number, max: number, future: boolean): number {
    return future || max <= 0 ? BAR_MIN : Math.max(BAR_MIN, Math.round((value / max) * BAR_FULL));
}
