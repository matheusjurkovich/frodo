export function centerClamp(pillX: number, pillW: number, panelW: number, monX: number, monW: number, margin = 8): number {
    const x = Math.round(pillX + pillW / 2 - panelW / 2);
    return Math.max(monX + margin, Math.min(x, monX + monW - panelW - margin));
}
