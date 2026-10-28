import type cairo from 'cairo';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {Level} from '../../features/claude/claude-usage.js';
import {levelClass} from './segment-bar.js';

type ThemeColor = ReturnType<St.ThemeNode['get_color']>;

const LINE_WIDTH = 3;

export function setSourceColor(cr: cairo.Context, color: ThemeColor): void {
    cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
}

export class ProgressRing {
    readonly actor = new St.DrawingArea({style_class: 'frodo-ring', y_align: Clutter.ActorAlign.CENTER});
    #percent = 0;
    #level: Level | null = null;

    constructor() {
        this.actor.connect('repaint', () => {
            this.#paint();
        });
        this.actor.connect('style-changed', () => {
            this.actor.queue_repaint();
        });
    }

    set percent(value: number) {
        this.#percent = Math.min(100, Math.max(0, value));
        this.actor.queue_repaint();
    }

    set level(value: Level) {
        if (value === this.#level) return;
        if (this.#level) this.actor.remove_style_class_name(levelClass(this.#level));
        this.#level = value;
        this.actor.add_style_class_name(levelClass(value));
    }

    #paint(): void {
        const cr = this.actor.get_context();
        const node = this.actor.get_theme_node();
        const [w, h] = this.actor.get_surface_size();
        const radius = Math.min(w, h) / 2 - 2;
        cr.setLineWidth(LINE_WIDTH);
        setSourceColor(cr, node.get_color('-frodo-track-color'));
        cr.arc(w / 2, h / 2, radius, 0, 2 * Math.PI);
        cr.stroke();
        if (this.#percent > 0) {
            setSourceColor(cr, node.get_foreground_color());
            cr.arc(w / 2, h / 2, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * this.#percent) / 100);
            cr.stroke();
        }
        cr.$dispose();
    }
}
