import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {DIM_OPACITY, HISTORY_SLOTS, MIN_BAR_HEIGHT, RECENT_BARS, SPARK_HEIGHT} from './sparkline.const.js';

export class Sparkline implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-perf-spark', x_expand: true});
    readonly #bars: St.Widget[] = [];

    constructor() {
        for (let index = 0; index < HISTORY_SLOTS; index++) {
            const bar = new St.Widget({style_class: 'frodo-perf-spark-bar', x_expand: true, y_align: Clutter.ActorAlign.END});
            bar.height = MIN_BAR_HEIGHT;
            bar.opacity = index >= HISTORY_SLOTS - RECENT_BARS ? 255 : DIM_OPACITY;
            this.#bars.push(bar);
            this.actor.add_child(bar);
        }
    }

    set values(history: readonly number[]) {
        const shown = history.slice(-HISTORY_SLOTS);
        const offset = HISTORY_SLOTS - shown.length;
        this.#bars.forEach((bar, index) => {
            const value = shown[index - offset] ?? 0;
            const height = Math.max(MIN_BAR_HEIGHT, Math.round(Math.min(1, value) * SPARK_HEIGHT));
            if (bar.height !== height) bar.height = height;
        });
    }

    destroy(): void {
        this.actor.destroy();
    }
}
