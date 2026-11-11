import type Clutter from 'gi://Clutter';
import type {TabId} from '../settings/schema-values.types.js';
import type {PillActivity} from './activity-feed.types.js';

export interface ActivityTick {
    readonly update: () => void;
    readonly seconds: number;
}

export interface ActivityRow {
    readonly children: Clutter.Actor[];
    readonly hasAction: boolean;
    readonly clickTab: TabId | null;
    readonly tick: ActivityTick | null;
    readonly refresh: ((activity: PillActivity) => void) | null;
}
