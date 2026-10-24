import type cairo from 'cairo';
import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';

export type Rgb = readonly [number, number, number];

export const COLORS = {
    ram: [0x7a / 255, 0xa2 / 255, 0xf7 / 255],
    battery: [0x7b / 255, 0xd8 / 255, 0x8f / 255],
    claude: [0xd9 / 255, 0x77 / 255, 0x57 / 255],
} as const satisfies Record<string, Rgb>;

function roundedBar(cr: cairo.Context, width: number, height: number): void {
    const r = height / 2;
    cr.newSubPath();
    cr.arc(width - r, r, r, -Math.PI / 2, Math.PI / 2);
    cr.arc(r, r, r, Math.PI / 2, (3 * Math.PI) / 2);
    cr.closePath();
}

export function separator(): St.Widget {
    return new St.Widget({style_class: 'frodo-sep', y_align: Clutter.ActorAlign.CENTER});
}

export function heading(text: string, icon: Gio.Icon | null = null): St.BoxLayout {
    const box = new St.BoxLayout({style_class: 'frodo-heading-box'});
    if (icon) box.add_child(new St.Icon({gicon: icon, style_class: 'frodo-heading-icon'}));
    box.add_child(new St.Label({text, style_class: 'frodo-heading', y_align: Clutter.ActorAlign.CENTER}));
    return box;
}

export function dimLabel(text = ''): St.Label {
    return new St.Label({text, style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
}

export function roundButton(icon: Gio.Icon, accessibleName: string, onClick: () => void): St.Button {
    const button = new St.Button({
        style_class: 'frodo-round-button',
        child: new St.Icon({gicon: icon, icon_size: 16}),
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessibleName,
    });
    button.connect('clicked', onClick);
    return button;
}

export class ProgressRing {
    readonly actor = new St.DrawingArea({style_class: 'frodo-ring', y_align: Clutter.ActorAlign.CENTER});
    #percent = 0;

    constructor(color: Rgb) {
        this.actor.connect('repaint', () => {
            const cr = this.actor.get_context();
            const [w, h] = this.actor.get_surface_size();
            const r = Math.min(w, h) / 2 - 2;
            cr.setLineWidth(3);
            cr.setSourceRGBA(1, 1, 1, 0.2);
            cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
            cr.stroke();
            if (this.#percent > 0) {
                cr.setSourceRGB(...color);
                cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * this.#percent) / 100);
                cr.stroke();
            }
            cr.$dispose();
        });
    }

    set percent(value: number) {
        this.#percent = Math.min(100, Math.max(0, value));
        this.actor.queue_repaint();
    }
}

export class ProgressBar {
    readonly actor = new St.DrawingArea({style_class: 'frodo-bar', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    #fraction = 0;

    constructor(color: Rgb) {
        this.actor.connect('repaint', () => {
            const cr = this.actor.get_context();
            const [w, h] = this.actor.get_surface_size();
            cr.setSourceRGBA(1, 1, 1, 0.15);
            roundedBar(cr, w, h);
            cr.fill();
            if (this.#fraction > 0) {
                cr.setSourceRGB(...color);
                roundedBar(cr, Math.max(h, w * this.#fraction), h);
                cr.fill();
            }
            cr.$dispose();
        });
    }

    set fraction(value: number) {
        this.#fraction = Math.min(1, Math.max(0, value));
        this.actor.queue_repaint();
    }
}

export class StatRow {
    readonly actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
    readonly #label: St.Label;
    readonly #bar: ProgressBar;
    readonly #note = new St.Label({style_class: 'frodo-stat-note', visible: false});

    constructor(name: string, color: Rgb) {
        this.#label = new St.Label({text: name, style_class: 'frodo-stat-label', y_align: Clutter.ActorAlign.CENTER});
        this.#bar = new ProgressBar(color);
        const row = new St.BoxLayout({style_class: 'frodo-stat', x_expand: true});
        row.add_child(this.#label);
        row.add_child(this.#bar.actor);
        this.actor.add_child(row);
        this.actor.add_child(this.#note);
    }

    set(text: string, fraction: number | null, note = ''): void {
        this.#label.text = text;
        this.#bar.actor.visible = fraction !== null;
        if (fraction !== null) this.#bar.fraction = fraction;
        this.#note.text = note;
        this.#note.visible = note !== '';
    }
}
