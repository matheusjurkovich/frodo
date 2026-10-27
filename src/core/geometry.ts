export function centerClamp(pillX: number, pillW: number, panelW: number, monX: number, monW: number, margin = 8): number {
    const x = Math.round(pillX + pillW / 2 - panelW / 2);
    return Math.max(monX + margin, Math.min(x, monX + monW - panelW - margin));
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
