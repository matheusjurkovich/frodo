import type Clutter from 'gi://Clutter';
import type St from 'gi://St';

export interface SliderSlots {
    readonly slider: St.Bin;
    readonly icon: St.Bin;
    readonly menu: St.Bin;
}

export type Toggle = Clutter.Actor & {subtitle: string | null; checked: boolean};
