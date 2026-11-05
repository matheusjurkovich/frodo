import type Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type {IslandPlacement} from './island-placement.js';

export interface IslandMotionDependencies {
    readonly panel: St.Bin;
    readonly backdrop: St.Widget;
    readonly pill: St.Widget;
    readonly placement: IslandPlacement;
    anchor(): Clutter.Actor;
    isOpen(): boolean;
}
