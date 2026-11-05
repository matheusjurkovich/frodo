import type Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import type St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface PillSectionDependencies {
    readonly settings: FrodoSettings;
    readonly interfaceSettings: Gio.Settings;
    readonly preview: Clutter.Actor;
    readonly overlay: St.Widget;
}
