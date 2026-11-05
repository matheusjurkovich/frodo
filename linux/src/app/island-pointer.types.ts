import type St from 'gi://St';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {Pill} from '../pill/pill.js';
import type {OpenReason} from './island.types.js';
import type {IslandPlacement} from './island-placement.js';

export interface IslandPointerDependencies {
    readonly pill: Pill;
    readonly panel: St.Bin;
    readonly tongue: St.Widget;
    readonly settings: FrodoSettings;
    readonly placement: IslandPlacement;
    isOpen(): boolean;
    openedBy(): OpenReason | null;
    covered(): boolean;
    open(reason: OpenReason): void;
    close(): void;
}
