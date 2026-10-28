import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {Bar} from '../../../core/claude-index.js';
import {barHeight} from '../../../core/geometry.js';

const DENSE_FROM = 16;

function barClass({current, future}: Bar): string {
    if (future) return 'frodo-chart-bar frodo-chart-bar-future';
    return current ? 'frodo-chart-bar frodo-chart-bar-current' : 'frodo-chart-bar';
}

export class BarChart {
    readonly actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-chart', x_expand: true});
    readonly #plot = new St.BoxLayout({style_class: 'frodo-chart-plot', x_expand: true});
    readonly #axis = new St.Widget({style_class: 'frodo-chart-axis', layout_manager: new Clutter.BinLayout(), x_expand: true});

    constructor() {
        this.#plot.layout_manager.homogeneous = true;
        this.actor.add_child(this.#plot);
        this.actor.add_child(this.#axis);
        this.#axis.connect('notify::width', () => {
            this.#place();
        });
    }

    set bars(value: readonly Bar[]) {
        this.#plot.destroy_all_children();
        this.#axis.destroy_all_children();
        if (value.length >= DENSE_FROM) this.actor.add_style_class_name('frodo-chart-dense');
        else this.actor.remove_style_class_name('frodo-chart-dense');
        const max = Math.max(0, ...value.map(bar => bar.value));
        for (const bar of value) {
            this.#plot.add_child(
                new St.Widget({
                    style_class: barClass(bar),
                    x_expand: true,
                    y_align: Clutter.ActorAlign.END,
                    height: barHeight(bar.value, max, bar.future),
                }),
            );
            this.#axis.add_child(
                new St.Label({
                    text: bar.label,
                    style_class: bar.current ? 'frodo-chart-label frodo-chart-label-current' : 'frodo-chart-label',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                }),
            );
        }
        this.#place();
    }

    #place(): void {
        const labels = this.#axis.get_children();
        const width = this.#axis.allocation.get_width();
        labels.forEach((text, index) => {
            text.translation_x = Math.round((width * (index + 0.5)) / labels.length - width / 2);
        });
    }
}
