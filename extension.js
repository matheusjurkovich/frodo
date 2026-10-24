import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class FrodoExtension extends Extension {
    enable() {
        this._pill = new St.Label({text: 'Frodo', style_class: 'frodo-pill'});
        Main.layoutManager.addTopChrome(this._pill, {trackFullscreen: true, affectsStruts: false});
        this._place();
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._pill.connect('notify::width', () => this._place());
    }

    _place() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        this._pill.set_position(Math.round(m.x + (m.width - this._pill.width) / 2), m.y + 6);
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorsId);
        Main.layoutManager.removeChrome(this._pill);
        this._pill.destroy();
        this._pill = null;
    }
}
