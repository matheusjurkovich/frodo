import type Clutter from 'gi://Clutter';
import type St from 'gi://St';

export type SectionId = 'general' | 'screen' | 'pill' | 'tabs' | 'ai' | 'agenda';

export interface SettingsActions {
    readonly back: () => void;
    readonly close: () => void;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
    readonly overlay: St.Widget;
}
