import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {formatGb} from './lib/meminfo.js';
import {claudeErrorText, formatDate} from './lib/format.js';
import {formatReset} from './lib/claude.js';

const COLORS = {
    ram: [0x7a / 255, 0xa2 / 255, 0xf7 / 255],
    battery: [0x7b / 255, 0xd8 / 255, 0x8f / 255],
    claude: [0xd9 / 255, 0x77 / 255, 0x57 / 255],
};

function roundedBar(cr, x, y, w, h) {
    const r = h / 2;
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    cr.arc(x + r, y + r, r, Math.PI / 2, 3 * Math.PI / 2);
    cr.closePath();
}

function bar(color) {
    const area = new St.DrawingArea({style_class: 'frodo-bar', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    area._fraction = 0;
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        cr.setSourceRGBA(1, 1, 1, 0.15);
        roundedBar(cr, 0, 0, w, h);
        cr.fill();
        const fw = Math.max(h, w * area._fraction);
        if (area._fraction > 0) {
            cr.setSourceRGB(...color);
            roundedBar(cr, 0, 0, fw, h);
            cr.fill();
        }
        cr.$dispose();
    });
    area.setFraction = f => {
        area._fraction = Math.min(1, Math.max(0, f));
        area.queue_repaint();
    };
    return area;
}

function statRow(name, color) {
    const row = new St.BoxLayout({style_class: 'frodo-stat', x_expand: true});
    const label = new St.Label({text: name, style_class: 'frodo-stat-label', y_align: Clutter.ActorAlign.CENTER});
    const b = bar(color);
    row.add_child(label);
    row.add_child(b);
    const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    const note = new St.Label({style_class: 'frodo-stat-note', visible: false});
    col.add_child(row);
    col.add_child(note);
    return {
        actor: col,
        set(text, fraction, noteText) {
            label.text = text;
            b.visible = fraction !== null;
            if (fraction !== null)
                b.setFraction(fraction);
            note.text = noteText ?? '';
            note.visible = !!noteText;
        },
    };
}

function heading(text) {
    return new St.Label({text, style_class: 'frodo-heading'});
}

function header(controls) {
    const box = new St.BoxLayout({style_class: 'frodo-header', x_expand: true});
    const clock = new St.Label({style_class: 'frodo-big-clock', y_align: Clutter.ActorAlign.CENTER});
    const date = new St.Label({style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
    const spacer = new St.Widget({x_expand: true});
    box.add_child(clock);
    box.add_child(date);
    box.add_child(spacer);
    box.add_child(controls.powerButton);
    const wall = new GnomeDesktop.WallClock();
    const sync = () => {
        clock.text = GLib.DateTime.new_now_local().format('%H:%M');
        date.text = formatDate(new Date());
    };
    const id = wall.connect('notify::clock', sync);
    sync();
    box.connect('destroy', () => wall.disconnect(id));
    return box;
}

export function systemSection(data) {
    const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-section', x_expand: true});
    const ram = statRow('RAM', COLORS.ram);
    const bat = statRow('Bat', COLORS.battery);
    col.add_child(heading('SISTEMA'));
    col.add_child(ram.actor);
    col.add_child(bat.actor);
    const sync = () => {
        const m = data.memory;
        ram.set(m ? `RAM ${formatGb(m.usedKb)}` : 'RAM —', m ? m.usedKb / m.totalKb : null);
        const b = data.battery;
        bat.actor.visible = !!b;
        if (b)
            bat.set(`Bat ${b.percent}%${b.charging ? ' ⚡' : ''}`, b.percent / 100);
    };
    const ids = ['memory', 'battery'].map(e => data.connect(e, sync));
    col.connect('destroy', () => ids.forEach(id => data.disconnect(id)));
    sync();
    return col;
}

export function claudeSection(data) {
    const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-section', x_expand: true});
    const session = statRow('Sessão', COLORS.claude);
    const weekly = statRow('Semana', COLORS.claude);
    const error = new St.Label({style_class: 'frodo-stat-note', visible: false});
    col.add_child(heading('CLAUDE'));
    col.add_child(session.actor);
    col.add_child(weekly.actor);
    col.add_child(error);
    const sync = () => {
        const c = data.claude;
        const now = Date.now();
        for (const [row, win, name] of [[session, c.session, 'Sessão'], [weekly, c.weekly, 'Semana']]) {
            if (win)
                row.set(`${name} ${Math.round(win.percent)}%`, win.percent / 100, formatReset(win.resetsAt, now));
            else
                row.set(`${name} —`, null);
        }
        error.text = claudeErrorText(c.error);
        error.visible = !!error.text;
    };
    const id = data.connect('claude', sync);
    col.connect('destroy', () => data.disconnect(id));
    sync();
    return col;
}

function bottom(parts) {
    const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'frodo-section'});
    if (parts.tray)
        box.add_child(parts.tray.actor);
    if (parts.notifications) {
        box.add_child(heading('NOTIFICAÇÕES'));
        box.add_child(parts.notifications.actor);
    }
    return box;
}

function single(parts) {
    const root = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-panel-content'});
    root.add_child(header(parts.controls));
    const cols = new St.BoxLayout({style_class: 'frodo-cols', x_expand: true});
    cols.add_child(parts.controls.actor);
    const right = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, style_class: 'frodo-right'});
    right.add_child(systemSection(parts.data));
    right.add_child(claudeSection(parts.data));
    cols.add_child(right);
    root.add_child(cols);
    root.add_child(bottom(parts));
    return root;
}

function tabs(parts) {
    const root = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-panel-content frodo-tabs-root'});
    root.add_child(header(parts.controls));
    const bar = new St.BoxLayout({style_class: 'frodo-tabbar', x_align: Clutter.ActorAlign.CENTER});
    const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});

    const controlsPage = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-section', x_expand: true});
    controlsPage.add_child(parts.controls.actor);
    if (parts.tray)
        controlsPage.add_child(parts.tray.actor);
    const notifPage = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    notifPage.add_child(parts.notifications.actor);

    const pages = [
        ['Controles', controlsPage],
        ['Sistema', systemSection(parts.data)],
        ['Claude', claudeSection(parts.data)],
        ['🔔', notifPage],
    ];
    const buttons = pages.map(([name, page], i) => {
        const button = new St.Button({label: name, style_class: 'frodo-tab', can_focus: true});
        button.connect('clicked', () => select(i));
        bar.add_child(button);
        stack.add_child(page);
        return button;
    });
    const bell = buttons[3];
    function select(index) {
        pages.forEach(([, page], i) => {
            page.visible = i === index;
            if (i === index)
                buttons[i].add_style_pseudo_class('checked');
            else
                buttons[i].remove_style_pseudo_class('checked');
        });
    }
    const syncCount = () => {
        const n = parts.bridge.list().length;
        bell.label = n ? `🔔 ${n}` : '🔔';
    };
    const id = parts.bridge.connect('changed', syncCount);
    root.connect('destroy', () => parts.bridge.disconnect(id));
    syncCount();
    select(0);

    root.add_child(bar);
    root.add_child(stack);
    return root;
}

export function buildPanel(layout, parts) {
    return layout === 'tabs' ? tabs(parts) : single(parts);
}
