import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {Level} from '../../core/claude-usage.js';
import {segmentWidths} from '../../core/geometry.js';

export interface Segment {
    readonly fraction: number;
    readonly styleClass: string;
}

export function levelClass(level: Level): string {
    return `frodo-level-${level}`;
}

export class SegmentBar {
    readonly actor: St.Widget;
    readonly #fills = new St.BoxLayout({x_expand: true, y_expand: true});
    readonly #marker = new St.Widget({style_class: 'frodo-marker', x_align: Clutter.ActorAlign.START, visible: false});
    #segments: readonly Segment[] = [];
    #markerFraction: number | null = null;

    constructor(styleClass = '') {
        this.actor = new St.Widget({
            style_class: `frodo-track ${styleClass}`.trim(),
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this.#fills);
        this.actor.add_child(this.#marker);
        this.actor.connect('notify::width', () => {
            this.#layout();
        });
    }

    set segments(value: readonly Segment[]) {
        this.#segments = value;
        this.#fills.destroy_all_children();
        for (const {styleClass} of value) this.#fills.add_child(new St.Widget({style_class: `frodo-segment ${styleClass}`}));
        this.#layout();
    }

    set marker(value: number | null) {
        this.#markerFraction = value;
        this.#layout();
    }

    #layout(): void {
        const width = this.actor.width;
        const widths = segmentWidths(
            this.#segments.map(({fraction}) => fraction),
            width,
        );
        this.#fills.get_children().forEach((child, index) => {
            const segmentWidth = widths[index] ?? 0;
            child.visible = segmentWidth > 0;
            child.width = segmentWidth;
        });
        const fraction = this.#markerFraction;
        this.#marker.visible = fraction !== null && width > 0;
        if (fraction !== null) this.#marker.translation_x = Math.round(Math.min(width - 1, Math.max(1, width * fraction))) - 1;
    }
}
