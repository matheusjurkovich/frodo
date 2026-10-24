import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Data} from './lib/data.js';
import {formatGb} from './lib/meminfo.js';

export default class FrodoExtension extends Extension {
    enable() {
        this._data = new Data(this.getSettings());
        this._pill = new St.Label({text: 'Frodo', style_class: 'frodo-pill'});
        const sync = () => {
            const ram = this._data.memory ? formatGb(this._data.memory.usedKb) : '—';
            const claude = this._data.claude.session ? `${this._data.claude.session.percent}%` : '—';
            this._pill.text = `RAM ${ram} · Claude ${claude}`;
        };
        this._data.connect('memory', sync);
        this._data.connect('claude', sync);
        this._data.setMemoryWanted(true);
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
        this._data.destroy();
        this._data = null;
    }
}
