import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {dimLabel} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {FADE_MS} from './idle-view.const.js';
import type {TextItem} from './closed-items.types.js';

export class RotatingSlot implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-rotating', y_align: Clutter.ActorAlign.CENTER});
    readonly label = dimLabel();
    readonly #dots = new St.BoxLayout({style_class: 'frodo-rotating-dots', y_align: Clutter.ActorAlign.CENTER});
    readonly #items: () => TextItem[];
    readonly #text: (item: TextItem) => string;
    #index = 0;

    constructor(items: () => TextItem[], text: (item: TextItem) => string) {
        this.#items = items;
        this.#text = text;
        this.actor.add_child(this.label);
        this.actor.add_child(this.#dots);
    }

    isVisible(): boolean {
        return this.#items().length > 0;
    }

    update(): void {
        const items = this.#items();
        const current = this.#index % Math.max(1, items.length);
        const item = items[current];
        if (item) this.label.text = this.#text(item);
        this.#syncDots(items.length, current);
    }

    #syncDots(count: number, current: number): void {
        this.#dots.visible = count > 1;
        const dots = this.#dots.get_children().filter(child => child instanceof St.Widget);
        while (dots.length > count) dots.pop()?.destroy();
        while (dots.length < count) {
            const dot = new St.Widget({style_class: 'frodo-rotating-dot', y_align: Clutter.ActorAlign.CENTER});
            this.#dots.add_child(dot);
            dots.push(dot);
        }
        dots.forEach((dot, index) => {
            if (index === current) dot.add_style_class_name('frodo-rotating-dot-current');
            else dot.remove_style_class_name('frodo-rotating-dot-current');
        });
    }

    advance(): void {
        const count = this.#items().length;
        if (count === 0) return;
        this.label.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.#index = (this.#index + 1) % count;
                this.update();
                this.label.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            },
        });
    }

    destroy(): void {
        this.actor.destroy();
    }
}
