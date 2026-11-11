import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {segmentWidths} from '../geometry.js';
import {allocatedWidth} from './layout.js';
import type {Segment} from './segment-bar.types.js';

export class SegmentBar {
    readonly actor: St.Widget;
    readonly #fills = new St.BoxLayout({x_expand: true, y_expand: true});
    readonly #marker = new St.Widget({style_class: 'frodo-marker', x_align: Clutter.ActorAlign.START, visible: false});
    readonly #widgets: St.Widget[] = [];
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
        const previous = this.#segments;
        this.#segments = value;
        const unchanged =
            value.length === previous.length &&
            value.every(
                ({fraction, styleClass}, index) => fraction === previous[index]?.fraction && styleClass === previous[index].styleClass,
            );
        if (unchanged) return;
        value.forEach(({styleClass}, index) => {
            const styleClassName = `frodo-segment ${styleClass}`;
            const fill = this.#widgets[index];
            if (!fill) {
                const created = new St.Widget({style_class: styleClassName});
                this.#widgets.push(created);
                this.#fills.add_child(created);
            } else if (fill.style_class !== styleClassName) fill.style_class = styleClassName;
        });
        for (const extra of this.#widgets.splice(value.length)) extra.destroy();
        this.#layout();
    }

    set marker(value: number | null) {
        this.#markerFraction = value;
        this.#layout();
    }

    #layout(): void {
        const width = allocatedWidth(this.actor);
        const widths = segmentWidths(
            this.#segments.map(({fraction}) => fraction),
            width,
        );
        this.#widgets.forEach((child, index) => {
            const segmentWidth = widths[index] ?? 0;
            child.visible = segmentWidth > 0;
            child.width = segmentWidth;
        });
        const fraction = this.#markerFraction;
        this.#marker.visible = fraction !== null && width > 0;
        if (fraction !== null) this.#marker.translation_x = Math.round(Math.min(width - 1, Math.max(1, width * fraction))) - 1;
    }
}
