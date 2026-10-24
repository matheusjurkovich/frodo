import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Data} from './lib/data.js';
import {Island} from './island.js';
import {Controls} from './controls.js';
import {buildPanel} from './panel.js';
import {NotificationBridge, NotificationList} from './notifications.js';

export default class FrodoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._data = new Data(this._settings);
        this._island = new Island({settings: this._settings, data: this._data});
        Main.layoutManager.addTopChrome(this._island.pill, {trackFullscreen: true, affectsStruts: false});
        Main.layoutManager.addTopChrome(this._island.panel, {affectsStruts: false});
        this._bridge = new NotificationBridge(this._island);
        this._buildPanel();
        this._layoutId = this._settings.connect('changed::open-layout', () => {
            this._island.close();
            this._buildPanel();
        });
        Main.wm.addKeybinding('toggle-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._island.toggle());
        this._place();
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._island.pill.connect('notify::width', () => this._place());
    }

    _destroyParts() {
        this._parts?.controls.destroy();
        this._parts?.notifications.destroy();
        this._parts = null;
    }

    _buildPanel() {
        this._destroyParts();
        this._parts = {
            data: this._data,
            controls: new Controls(this._island),
            notifications: new NotificationList(this._bridge, this._island),
        };
        this._island.setPanel(buildPanel(this._settings.get_string('open-layout'), this._parts));
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
        this._settings.disconnect(this._layoutId);
        Main.wm.removeKeybinding('toggle-shortcut');
        this._destroyParts();
        this._bridge.destroy();
        this._bridge = null;
        Main.layoutManager.removeChrome(this._island.pill);
        Main.layoutManager.removeChrome(this._island.panel);
        this._island.destroy();
        this._island = null;
        this._data.destroy();
        this._data = null;
        this._settings = null;
    }
}
