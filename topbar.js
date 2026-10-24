import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const FLOAT_TOP = 6;

export class TopBar {
    constructor(island, settings) {
        this._island = island;
        this._settings = settings;
        this._mode = null;
        const pill = island.pill;
        this._ids = [
            [settings, settings.connect('changed::hide-top-bar', () => this._apply())],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._place())],
            [pill, pill.connect('notify::width', () => this._place())],
            [pill, pill.connect('button-press-event', (_a, event) => {
                if (event.get_button() !== Clutter.BUTTON_SECONDARY)
                    return Clutter.EVENT_PROPAGATE;
                Main.panel.statusArea.dateMenu?.menu.toggle();
                return Clutter.EVENT_STOP;
            })],
        ];
        this._apply();
    }

    _detach() {
        const pill = this._island.pill;
        const panelBox = Main.layoutManager.panelBox;
        if (this._mode === 'bar') {
            pill.get_parent()?.remove_child(pill);
            this._dateMenu?.show();
        } else if (this._mode === 'float') {
            Main.layoutManager.removeChrome(pill);
            Main.layoutManager.trackChrome(panelBox, {affectsStruts: true, trackFullscreen: true});
            panelBox.show();
        }
        this._mode = null;
    }

    _apply() {
        this._detach();
        const pill = this._island.pill;
        if (this._settings.get_boolean('hide-top-bar')) {
            const panelBox = Main.layoutManager.panelBox;
            Main.layoutManager.untrackChrome(panelBox);
            panelBox.hide();
            Main.layoutManager.addTopChrome(pill, {trackFullscreen: true, affectsStruts: false});
            this._mode = 'float';
            this._place();
            return;
        }
        const center = Main.panel._centerBox;
        this._dateMenu = Main.panel.statusArea.dateMenu?.container ?? null;
        const index = this._dateMenu ? center.get_children().indexOf(this._dateMenu) : -1;
        this._dateMenu?.hide();
        pill.fixed_position_set = false;
        pill.y_align = Clutter.ActorAlign.CENTER;
        center.insert_child_at_index(pill, Math.max(0, index));
        this._mode = 'bar';
    }

    _place() {
        if (this._mode !== 'float')
            return;
        const m = Main.layoutManager.primaryMonitor;
        const pill = this._island.pill;
        if (m)
            pill.set_position(Math.round(m.x + (m.width - pill.width) / 2), m.y + FLOAT_TOP);
    }

    destroy() {
        this._ids.forEach(([obj, id]) => obj.disconnect(id));
        this._detach();
    }
}
