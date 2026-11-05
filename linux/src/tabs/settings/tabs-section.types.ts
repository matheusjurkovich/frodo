import type St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface TabsSectionDependencies {
    readonly settings: FrodoSettings;
    readonly overlay: St.Widget;
}
