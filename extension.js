import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Data} from './lib/data.js';
import {Island} from './island.js';
import {TopBar} from './topbar.js';
import {Controls} from './controls.js';
import {buildPanel} from './panel.js';
import {NotificationBridge, NotificationList} from './notifications.js';
import {TrayRow} from './tray.js';

export default class FrodoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._data = new Data(this._settings);
        this._island = new Island({settings: this._settings, data: this._data});
        Main.layoutManager.addTopChrome(this._island.panel, {affectsStruts: false});
        this._bridge = new NotificationBridge(this._island);
        this._buildPanel();
        this._layoutId = this._settings.connect('changed::open-layout', () => {
            this._island.close();
            this._buildPanel();
        });
        Main.wm.addKeybinding('toggle-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._island.toggle());
        this._topBar = new TopBar(this._island, this._settings);
    }

    _destroyParts() {
        this._parts?.controls.destroy();
        this._parts?.notifications.destroy();
        this._parts?.tray.destroy();
        this._parts = null;
    }

    _buildPanel() {
        this._destroyParts();
        this._parts = {
            data: this._data,
            bridge: this._bridge,
            openPreferences: () => {
                this._island.close();
                this.openPreferences();
            },
            controls: new Controls(this._island),
            notifications: new NotificationList(this._bridge, this._island),
            tray: new TrayRow(this._island),
        };
        this._island.setPanel(buildPanel(this._settings.get_string('open-layout'), this._parts));
    }

    disable() {
        this._island.close();
        this._topBar.destroy();
        this._topBar = null;
        this._settings.disconnect(this._layoutId);
        Main.wm.removeKeybinding('toggle-shortcut');
        this._destroyParts();
        this._bridge.destroy();
        this._bridge = null;
        Main.layoutManager.removeChrome(this._island.panel);
        this._island.destroy();
        this._island = null;
        this._data.destroy();
        this._data = null;
        this._settings = null;
    }
}
