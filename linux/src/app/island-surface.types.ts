import type St from 'gi://St';
import type {FrodoSettings} from '../settings/frodo-settings.js';

export interface IslandSurfaceDependencies {
    readonly settings: FrodoSettings;
    readonly backdrop: St.Widget;
    readonly panel: St.Widget;
    readonly tongue: St.Widget;
    readonly pill: St.Widget;
    attached(): boolean;
}
