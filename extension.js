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
        Main.layoutManager.removeChrome(this._island.pill);
        this._island.destroy();
        this._island = null;
        this._data.destroy();
        this._data = null;
        this._settings = null;
    }
}
