import type Gio from 'gi://Gio';

import {CLOSED_ITEMS, CLOSED_MODES, MONITOR_MODES, isOneOf} from '../core/types.js';
import type {ClosedItem, ClosedMode, MonitorMode} from '../core/types.js';
import type {Disposer} from '../util/disposables.js';

export const SCHEMA_ID = 'org.gnome.shell.extensions.frodo';

export type SettingsKey =
    'closed-mode' | 'closed-items' | 'rotate-seconds' | 'monitors' | 'hide-top-bar' | 'claude-poll-minutes' | 'toggle-shortcut';

export class FrodoSettings {
    constructor(readonly gsettings: Gio.Settings) {}

    get closedMode(): ClosedMode {
        const value = this.gsettings.get_string('closed-mode');
        return isOneOf(CLOSED_MODES, value) ? value : 'compact';
    }

    set closedMode(value: ClosedMode) {
        this.gsettings.set_string('closed-mode', value);
    }

    get closedItems(): ClosedItem[] {
        return [...new Set(this.gsettings.get_strv('closed-items'))].filter((item): item is ClosedItem => isOneOf(CLOSED_ITEMS, item));
    }

    set closedItems(items: readonly ClosedItem[]) {
        this.gsettings.set_strv('closed-items', [...new Set(items)]);
    }

    get rotateSeconds(): number {
        return this.gsettings.get_int('rotate-seconds');
    }

    get monitors(): MonitorMode {
        const value = this.gsettings.get_string('monitors');
        return isOneOf(MONITOR_MODES, value) ? value : 'primary';
    }

    set monitors(value: MonitorMode) {
        this.gsettings.set_string('monitors', value);
    }

    get hideTopBar(): boolean {
        return this.gsettings.get_boolean('hide-top-bar');
    }

    set hideTopBar(value: boolean) {
        this.gsettings.set_boolean('hide-top-bar', value);
    }

    get claudePollMinutes(): number {
        return this.gsettings.get_int('claude-poll-minutes');
    }

    get toggleShortcut(): string {
        return this.gsettings.get_strv('toggle-shortcut')[0] ?? '';
    }

    set toggleShortcut(value: string) {
        this.gsettings.set_strv('toggle-shortcut', [value]);
    }

    onChanged(keys: SettingsKey | readonly SettingsKey[], callback: () => void): Disposer {
        const ids = (typeof keys === 'string' ? [keys] : keys).map(key => this.gsettings.connect(`changed::${key}`, callback));
        return () => {
            for (const id of ids) this.gsettings.disconnect(id);
        };
    }
}
