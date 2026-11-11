import Clutter from 'gi://Clutter';
import {dimLabel} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {FADE_MS} from './idle-view.const.js';
import type {TextItem} from './closed-items.types.js';

export class RotatingSlot implements Component {
    readonly actor = dimLabel();
    readonly #items: () => TextItem[];
    readonly #text: (item: TextItem) => string;
    #index = 0;

    constructor(items: () => TextItem[], text: (item: TextItem) => string) {
        this.#items = items;
        this.#text = text;
    }

    isVisible(): boolean {
        return this.#items().length > 0;
    }

    update(): void {
        const items = this.#items();
        const item = items[this.#index % Math.max(1, items.length)];
        if (item) this.actor.text = this.#text(item);
    }

    advance(): void {
        const count = this.#items().length;
        if (count === 0) return;
        this.actor.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.#index = (this.#index + 1) % count;
                this.update();
                this.actor.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            },
        });
    }

    destroy(): void {
        this.actor.destroy();
    }
}
