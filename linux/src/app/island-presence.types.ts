import type St from 'gi://St';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {ActivityFeed} from '../pill/activity-feed.js';
import type {Pill} from '../pill/pill.js';
import type {IslandPlacement} from './island-placement.js';

export interface IslandPresenceDependencies {
    readonly pill: Pill;
    readonly tongue: St.Widget;
    readonly settings: FrodoSettings;
    readonly feed: ActivityFeed;
    readonly placement: IslandPlacement;
    readonly monitorIndex: number;
    isOpen(): boolean;
    close(): void;
}
