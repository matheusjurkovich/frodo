import type Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export type ShortcutKey = 'toggle-shortcut' | 'claude-shortcut';

export interface GeneralSectionDependencies {
    readonly settings: FrodoSettings;
    readonly interfaceSettings: Gio.Settings;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
}
