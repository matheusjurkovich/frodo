import type cairo from 'cairo';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

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

export function heading(text: string): St.Label {
    return new St.Label({text, style_class: 'frodo-heading'});
}

export function dimLabel(text = ''): St.Label {
    return new St.Label({text, style_class: 'frodo-dim', y_align: Clutter.ActorAlign.CENTER});
}

export function roundButton(iconName: string, accessibleName: string, onClick: () => void): St.Button {
    const button = new St.Button({
        style_class: 'frodo-round-button',
        child: new St.Icon({icon_name: iconName, icon_size: 14}),
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

export interface TileOptions {
    readonly icon: string;
    readonly title: string;
    readonly onToggle: () => void;
    readonly onArrow?: () => void;
}

export class Tile {
    readonly actor = new St.BoxLayout({style_class: 'frodo-tile', x_expand: true});
    readonly #subtitle = new St.Label({style_class: 'frodo-tile-sub', visible: false});

    constructor({icon, title, onToggle, onArrow}: TileOptions) {
        const content = new St.BoxLayout({style_class: 'frodo-tile-content', x_expand: true, x_align: Clutter.ActorAlign.START});
        const texts = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER});
        texts.add_child(new St.Label({text: title, style_class: 'frodo-tile-title'}));
        texts.add_child(this.#subtitle);
        content.add_child(new St.Icon({icon_name: icon, style_class: 'frodo-tile-icon'}));
        content.add_child(texts);

        const main = new St.Button({
            style_class: 'frodo-tile-main',
            x_expand: true,
            can_focus: true,
            child: content,
            accessible_name: title,
        });
        main.connect('clicked', onToggle);
        this.actor.add_child(main);

        if (onArrow) {
            const arrow = new St.Button({
                style_class: 'frodo-tile-arrow',
                child: new St.Icon({icon_name: 'go-next-symbolic', icon_size: 12}),
                can_focus: true,
                accessible_name: `${title}: opções`,
            });
            arrow.connect('clicked', onArrow);
            this.actor.add_child(arrow);
        }
    }

    set(active: boolean, subtitle: string | null = null): void {
        if (active) this.actor.add_style_class_name('frodo-tile-on');
        else this.actor.remove_style_class_name('frodo-tile-on');
        this.#subtitle.text = subtitle ?? '';
        this.#subtitle.visible = !!subtitle;
    }
}

export class SliderRow {
    readonly actor = new St.BoxLayout({style_class: 'frodo-slider-row', x_expand: true});
    readonly slider = new Slider(0);

    constructor(iconName: string, accessibleName: string) {
        this.slider.x_expand = true;
        this.slider.accessible_name = accessibleName;
        this.actor.add_child(new St.Icon({icon_name: iconName, style_class: 'frodo-slider-icon'}));
        this.actor.add_child(this.slider);
    }
}
