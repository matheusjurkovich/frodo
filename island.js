import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';

import {formatGb} from './lib/meminfo.js';
import {batteryIconName, centerClamp} from './lib/format.js';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 300;
const ANIM_MS = 250;

const CLAUDE_COLOR = [0xd9 / 255, 0x77 / 255, 0x57 / 255];
function sep() {
    return new St.Widget({style_class: 'frodo-sep', y_align: Clutter.ActorAlign.CENTER});
}

function ring(getPercent) {
    const area = new St.DrawingArea({style_class: 'frodo-ring', y_align: Clutter.ActorAlign.CENTER});
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const r = Math.min(w, h) / 2 - 2;
        cr.setLineWidth(3);
        cr.setSourceRGBA(1, 1, 1, 0.2);
        cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
        cr.stroke();
        const p = Math.min(100, Math.max(0, getPercent() ?? 0));
        if (p > 0) {
            cr.setSourceRGB(...CLAUDE_COLOR);
            cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p / 100);
            cr.stroke();
        }
        cr.$dispose();
    });
    return area;
}

export class Island extends EventEmitter {
    constructor({settings, data}) {
        super();
        this._settings = settings;
        this._data = data;
        this._rotateIndex = 0;
        this._rotateId = 0;
        this._isOpen = false;
        this._holds = 0;

        this.pill = new St.BoxLayout({
            style_class: 'frodo-pill',
            reactive: true,
            track_hover: true,
        });

        this.panel = new St.Bin({
            style_class: 'frodo-panel',
            reactive: true,
            track_hover: true,
            visible: false,
        });
        this._grab = new GrabHelper(this.panel);
        this._openTimer = 0;
        this._closeTimer = 0;
        this.pill.connect('notify::hover', () => this._onPillHover());
        this.pill.connect('button-press-event', (_a, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this.open('click');
            return Clutter.EVENT_STOP;
        });
        this.panel.connect('notify::hover', () => this._onPanelHover());
        this.panel.connect('key-press-event', (_a, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });

        this._clock = new GnomeDesktop.WallClock();
        this._clockId = this._clock.connect('notify::clock', () => this._syncClock());

        this._settingsIds = ['closed-mode', 'closed-items', 'rotate-seconds']
            .map(k => settings.connect(`changed::${k}`, () => this._build()));
        this._dataIds = ['memory', 'battery', 'claude']
            .map(e => data.connect(e, () => this._update()));

        this._build();
    }

    setPanel(actor) {
        this.panel.child?.destroy();
        this.panel.child = actor;
    }

    _clearTimer(name) {
        if (this[name])
            GLib.source_remove(this[name]);
        this[name] = 0;
    }

    _later(name, ms, fn) {
        this._clearTimer(name);
        this[name] = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this[name] = 0;
            fn();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onPillHover() {
        if (this._isOpen)
            return;
        if (this.pill.hover)
            this._later('_openTimer', OPEN_DELAY_MS, () => this.open('hover'));
        else
            this._clearTimer('_openTimer');
    }

    holdWhileOpen(menu) {
        menu.connect('open-state-changed', (_m, open) => {
            this._holds = Math.max(0, this._holds + (open ? 1 : -1));
            this._onPanelHover();
        });
    }

    _onPanelHover() {
        if (!this._isOpen)
            return;
        if (this.panel.hover || this._holds > 0)
            this._clearTimer('_closeTimer');
        else if (this._openedBy === 'hover')
            this._later('_closeTimer', CLOSE_DELAY_MS, () => this.close());
    }

    toggle() {
        if (this._isOpen)
            this.close();
        else
            this.open('key');
    }

    _shrinkScale() {
        const pw = Math.max(1, this.pill.width), ph = Math.max(1, this.pill.height);
        return {
            scale_x: Math.min(1, pw / Math.max(1, this.panel.width)),
            scale_y: Math.min(1, ph / Math.max(1, this.panel.height)),
        };
    }

    open(by) {
        if (this._isOpen)
            return;
        this._clearTimer('_openTimer');
        this._isOpen = true;
        this._openedBy = by;
        this._syncMemoryWanted();
        this._data.refreshClaude(60);

        const panel = this.panel;
        panel.remove_all_transitions();
        panel.opacity = 0;
        panel.show();
        const [px, py] = this.pill.get_transformed_position();
        const [, natW] = panel.get_preferred_width(-1);
        const [, natH] = panel.get_preferred_height(natW);
        panel.set_size(natW, natH);
        const m = Main.layoutManager.findMonitorForActor(this.pill) ?? Main.layoutManager.primaryMonitor;
        panel.set_position(centerClamp(px, this.pill.width, natW, m.x, m.width), Math.round(py));
        panel.set_pivot_point((px + this.pill.width / 2 - panel.x) / natW, 0);
        const shrink = this._shrinkScale();
        panel.scale_x = shrink.scale_x;
        panel.scale_y = shrink.scale_y;
        panel.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.pill.ease({opacity: 0, duration: ANIM_MS / 2, mode: Clutter.AnimationMode.EASE_OUT_QUAD});

        if (by !== 'hover')
            this._grab.grab({actor: panel, focus: panel, onUngrab: () => this.close()});
        this.emit('opened');
    }

    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        this._clearTimer('_openTimer');
        this._clearTimer('_closeTimer');
        if (this._grab.isActorGrabbed(this.panel))
            this._grab.ungrab({actor: this.panel});

        const panel = this.panel;
        panel.ease({
            opacity: 0,
            ...this._shrinkScale(),
            duration: ANIM_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                panel.hide();
                panel.set_size(-1, -1);
            },
        });
        this.pill.ease({opacity: 255, duration: ANIM_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._syncMemoryWanted();
        this.emit('closed');
    }

    get isOpen() {
        return this._isOpen;
    }

    _mode() {
        return this._settings.get_string('closed-mode');
    }

    _items() {
        return this._settings.get_strv('closed-items');
    }

    _visibleItems() {
        return this._items().filter(i => i !== 'battery' || this._data.battery);
    }

    wantsMemory() {
        return this._isOpen || (this._mode() !== 'minimal' && this._items().includes('ram'));
    }

    _syncMemoryWanted() {
        this._data.setMemoryWanted(this.wantsMemory());
    }

    _syncClock() {
        this._clockLabel.text = GLib.DateTime.new_now_local().format('%H:%M');
    }

    _stopRotation() {
        if (this._rotateId)
            GLib.source_remove(this._rotateId);
        this._rotateId = 0;
    }

    _build() {
        this._stopRotation();
        this.pill.destroy_all_children();
        this._widgets = {};
        this._clockLabel = new St.Label({style_class: 'frodo-clock', y_align: Clutter.ActorAlign.CENTER});
        this._syncClock();

        const mode = this._mode();
        const items = this._items();

        if (mode === 'minimal') {
            this.pill.add_child(this._clockLabel);
        } else if (mode === 'rotating') {
            this.pill.add_child(this._clockLabel);
            this._rotateSep = sep();
            this.pill.add_child(this._rotateSep);
            this._slot = new St.Label({style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
            this.pill.add_child(this._slot);
            this._rotateIndex = 0;
            this._rotateId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
                this._settings.get_int('rotate-seconds'), () => {
                    this._rotate();
                    return GLib.SOURCE_CONTINUE;
                });
        } else {
            if (items.includes('battery')) {
                const box = new St.BoxLayout({style_class: 'frodo-battery', y_align: Clutter.ActorAlign.CENTER});
                const icon = new St.Icon({style_class: 'frodo-battery-icon'});
                const label = new St.Label({style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
                box.add_child(icon);
                box.add_child(label);
                const s = sep();
                this.pill.add_child(box);
                this.pill.add_child(s);
                this._widgets.battery = {box, icon, label, sep: s};
            }
            this.pill.add_child(this._clockLabel);
            for (const item of items) {
                if (item === 'battery')
                    continue;
                if (item === 'ram') {
                    this.pill.add_child(sep());
                    const label = new St.Label({style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
                    this.pill.add_child(label);
                    this._widgets.ram = {label};
                } else {
                    const key = item === 'claude-session' ? 'session' : 'weekly';
                    const area = ring(() => this._data.claude[key]?.percent);
                    const dash = new St.Label({text: '—', style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
                    this.pill.add_child(area);
                    this.pill.add_child(dash);
                    this._widgets[item] = {area, dash, key};
                }
            }
        }
        this._syncMemoryWanted();
        this._update();
    }

    _itemText(item) {
        const d = this._data;
        if (item === 'battery')
            return d.battery ? `Bat ${d.battery.percent}%` : null;
        if (item === 'ram')
            return d.memory ? `RAM ${formatGb(d.memory.usedKb)}` : 'RAM —';
        const win = item === 'claude-session' ? d.claude.session : d.claude.weekly;
        const name = item === 'claude-session' ? 'Claude' : 'Semana';
        return win ? `${name} ${Math.round(win.percent)}%` : `${name} —`;
    }

    _rotate() {
        const items = this._visibleItems();
        if (!items.length)
            return;
        this._slot.ease({
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._rotateIndex = (this._rotateIndex + 1) % items.length;
                this._update();
                this._slot.ease({opacity: 255, duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            },
        });
    }

    _update() {
        const mode = this._mode();
        if (mode === 'rotating') {
            const items = this._visibleItems();
            const has = items.length > 0;
            this._slot.visible = has;
            this._rotateSep.visible = has;
            if (has)
                this._slot.text = this._itemText(items[this._rotateIndex % items.length]);
            return;
        }
        if (mode !== 'compact')
            return;
        const w = this._widgets;
        if (w.battery) {
            const b = this._data.battery;
            w.battery.box.visible = !!b;
            w.battery.sep.visible = !!b;
            if (b) {
                w.battery.icon.icon_name = batteryIconName(b);
                w.battery.label.text = `${b.percent}%`;
            }
        }
        if (w.ram)
            w.ram.label.text = this._itemText('ram');
        for (const item of ['claude-session', 'claude-weekly']) {
            if (!w[item])
                continue;
            const ok = !!this._data.claude[w[item].key];
            w[item].area.visible = ok;
            w[item].dash.visible = !ok;
            if (ok)
                w[item].area.queue_repaint();
        }
    }

    destroy() {
        if (this._grab.isActorGrabbed(this.panel))
            this._grab.ungrab({actor: this.panel});
        this._isOpen = false;
        this._clearTimer('_openTimer');
        this._clearTimer('_closeTimer');
        this._stopRotation();
        this._clock.disconnect(this._clockId);
        this._clock = null;
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._dataIds.forEach(id => this._data.disconnect(id));
        this.pill.destroy();
        this.panel.destroy();
        this.disconnectAll();
    }
}
