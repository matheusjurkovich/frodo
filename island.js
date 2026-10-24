import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {formatGb} from './lib/meminfo.js';
import {batteryIconName} from './lib/format.js';

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

        this.pill = new St.BoxLayout({
            style_class: 'frodo-pill',
            reactive: true,
            track_hover: true,
        });

        this._clock = new GnomeDesktop.WallClock();
        this._clockId = this._clock.connect('notify::clock', () => this._syncClock());

        this._settingsIds = ['closed-mode', 'closed-items', 'rotate-seconds']
            .map(k => settings.connect(`changed::${k}`, () => this._build()));
        this._dataIds = ['memory', 'battery', 'claude']
            .map(e => data.connect(e, () => this._update()));

        this._build();
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
        this._stopRotation();
        this._clock.disconnect(this._clockId);
        this._clock = null;
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._dataIds.forEach(id => this._data.disconnect(id));
        this.pill.destroy();
        this.disconnectAll();
    }
}
