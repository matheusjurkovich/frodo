import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {Bar} from '../../features/claude/claude-index.js';
import {barHeight} from '../../shared/geometry.js';
import {allocatedWidth} from '../../shared/ui/layout.js';
import {DENSE_FROM} from './bar-chart.const.js';

function barClass({current, future}: Bar): string {
    if (future) return 'frodo-chart-bar frodo-chart-bar-future';
    return current ? 'frodo-chart-bar frodo-chart-bar-current' : 'frodo-chart-bar';
}

function labelClass({current}: Bar): string {
    return current ? 'frodo-chart-label frodo-chart-label-current' : 'frodo-chart-label';
}

export class BarChart {
    readonly actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-chart', x_expand: true});
    readonly #plot = new St.BoxLayout({style_class: 'frodo-chart-plot', x_expand: true});
    readonly #axis = new St.Widget({style_class: 'frodo-chart-axis', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #columns: St.Widget[] = [];
    readonly #labels: St.Label[] = [];

    constructor() {
        this.#plot.layout_manager.homogeneous = true;
        this.actor.add_child(this.#plot);
        this.actor.add_child(this.#axis);
        this.#axis.connect('notify::width', () => {
            this.#place();
        });
    }

    set bars(value: readonly Bar[]) {
        if (value.length >= DENSE_FROM) this.actor.add_style_class_name('frodo-chart-dense');
        else this.actor.remove_style_class_name('frodo-chart-dense');
        const resized = this.#columns.length !== value.length;
        while (this.#columns.length < value.length) {
            const column = new St.Widget({x_expand: true, y_align: Clutter.ActorAlign.END});
            const text = new St.Label({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
            this.#columns.push(column);
            this.#labels.push(text);
            this.#plot.add_child(column);
            this.#axis.add_child(text);
        }
        for (const extra of [...this.#columns.splice(value.length), ...this.#labels.splice(value.length)]) extra.destroy();
        const max = Math.max(0, ...value.map(bar => bar.value));
        value.forEach((bar, index) => {
            const column = this.#columns[index];
            const text = this.#labels[index];
            if (!column || !text) return;
            const columnClass = barClass(bar);
            if (column.style_class !== columnClass) column.style_class = columnClass;
            column.height = barHeight(bar.value, max, bar.future);
            const textClass = labelClass(bar);
            if (text.style_class !== textClass) text.style_class = textClass;
            if (text.text !== bar.label) text.text = bar.label;
        });
        if (resized) this.#place();
    }

    #place(): void {
        const width = allocatedWidth(this.#axis);
        this.#labels.forEach((text, index) => {
            text.translation_x = Math.round((width * (index + 0.5)) / this.#labels.length - width / 2);
        });
    }
}
