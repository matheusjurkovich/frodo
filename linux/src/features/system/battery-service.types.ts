import type UPower from 'gi://UPowerGlib';

export interface DisplayDevice {
    readonly IsPresent: boolean;
    readonly Percentage: number;
    readonly State: UPower.DeviceState;
}
