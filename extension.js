import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Data} from './lib/data.js';
import {Island} from './island.js';

export default class FrodoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._data = new Data(this._settings);
        this._island = new Island({settings: this._settings, data: this._data});
        Main.layoutManager.addTopChrome(this._island.pill, {trackFullscreen: true, affectsStruts: false});
        Main.layoutManager.addTopChrome(this._island.panel, {affectsStruts: false});
        this._island.setPanel(new St.Label({text: 'painel'}));
        Main.wm.addKeybinding('toggle-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._island.toggle());
        this._place();
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._island.pill.connect('notify::width', () => this._place());
    }

    _place() {
        const m = Main.layoutManager.primaryMonitor;
        const pill = this._island.pill;
        if (!m)
            return;
        pill.set_position(Math.round(m.x + (m.width - pill.width) / 2), m.y + 6);
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorsId);
        Main.wm.removeKeybinding('toggle-shortcut');
        Main.layoutManager.removeChrome(this._island.pill);
        Main.layoutManager.removeChrome(this._island.panel);
        this._island.destroy();
        this._island = null;
        this._data.destroy();
        this._data = null;
        this._settings = null;
    }
}
