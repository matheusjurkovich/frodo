import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {allocatedWidth} from './layout.js';
import type {Component} from './lifecycle.js';

const WRAP_SPACING = 6;

function rowBox(): St.BoxLayout {
    return new St.BoxLayout({style_class: 'frodo-wrap-row', x_expand: true});
}

export class Wrap implements Component {
    readonly actor: St.BoxLayout;
    #items: readonly Clutter.Actor[];
    #rows: readonly number[];

    constructor(styleClass: string, items: readonly Clutter.Actor[]) {
        this.actor = new St.BoxLayout({style_class: `frodo-wrap ${styleClass}`, orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this.#items = items;
        this.#rows = [items.length];
        const row = rowBox();
        for (const item of items) row.add_child(item);
        this.actor.add_child(row);
        this.actor.connect('notify::width', () => {
            this.#reflow();
        });
    }

    setItems(items: readonly Clutter.Actor[]): void {
        this.#items = items;
        this.#rows = [];
        this.#reflow();
    }

    #reflow(): void {
        if (!this.actor.mapped) return;
        const width = allocatedWidth(this.actor);
        const rows: number[] = [];
        let used = 0;
        let size = 0;
        for (const item of this.#items) {
            const [, natural] = item.get_preferred_width(-1);
            if (size > 0 && width > 0 && used + WRAP_SPACING + natural > width) {
                rows.push(size);
                size = 0;
            }
            used = size === 0 ? natural : used + WRAP_SPACING + natural;
            size++;
        }
        if (size > 0) rows.push(size);
        if (rows.join() === this.#rows.join()) return;
        this.#rows = rows;
        for (const item of this.#items) item.get_parent()?.remove_child(item);
        this.actor.destroy_all_children();
        let next = 0;
        for (const count of rows) {
            const row = rowBox();
            for (const item of this.#items.slice(next, next + count)) row.add_child(item);
            next += count;
            this.actor.add_child(row);
        }
    }

    destroy(): void {
        this.actor.destroy();
    }
}
