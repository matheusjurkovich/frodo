import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';
import {setSourceColor} from '../shared/ui/cairo.js';
import type {Component} from '../shared/ui/lifecycle.types.js';

export class Avatar implements Component {
    readonly actor = new St.Widget({
        style_class: 'frodo-pill-avatar',
        layout_manager: new Clutter.BinLayout(),
        y_align: Clutter.ActorAlign.CENTER,
    });

    readonly #corners = new St.DrawingArea({style_class: 'frodo-pill-avatar-corners', x_expand: true, y_expand: true});

    constructor(gicon: Gio.Icon) {
        this.#corners.connect('repaint', () => {
            this.#paint();
        });
        this.actor.add_child(new St.Icon({gicon, style_class: 'frodo-pill-avatar-icon'}));
        this.actor.add_child(this.#corners);
    }

    #paint(): void {
        const cr = this.#corners.get_context();
        const node = this.#corners.get_theme_node();
        const [w, h] = this.#corners.get_surface_size();
        const r = Math.min(node.get_border_radius(St.Corner.TOPLEFT), w / 2, h / 2);
        cr.rectangle(0, 0, w, h);
        cr.moveTo(r, 0);
        cr.arcNegative(r, r, r, -Math.PI / 2, Math.PI);
        cr.lineTo(0, h - r);
        cr.arcNegative(r, h - r, r, Math.PI, Math.PI / 2);
        cr.lineTo(w - r, h);
        cr.arcNegative(w - r, h - r, r, Math.PI / 2, 0);
        cr.lineTo(w, r);
        cr.arcNegative(w - r, r, r, 0, -Math.PI / 2);
        cr.closePath();
        setSourceColor(cr, node.get_foreground_color());
        cr.fill();
        cr.$dispose();
    }

    destroy(): void {
        this.actor.destroy();
    }
}
