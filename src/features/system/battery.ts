export interface BatteryInfo {
    readonly percent: number;
    readonly charging: boolean;
}

export type BatteryLevel = 'empty' | 'low' | 'medium' | 'high' | 'full' | 'charging';

export function batteryLevel(battery: BatteryInfo): BatteryLevel {
    if (battery.charging) return 'charging';
    if (battery.percent >= 90) return 'full';
    if (battery.percent >= 60) return 'high';
    if (battery.percent >= 35) return 'medium';
    if (battery.percent >= 10) return 'low';
    return 'empty';
}
