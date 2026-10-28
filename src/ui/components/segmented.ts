import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Emitter} from '../../util/emitter.js';
import {allocatedWidth, label} from './layout.js';

const WRAP_SPACING = 6;

interface Item {
    readonly button: St.Button;
    readonly count: St.Label;
}

function rowBox(): St.BoxLayout {
    return new St.BoxLayout({style_class: 'frodo-segmented-row', x_expand: true});
}

export class Segmented<T extends string> extends Emitter<{changed: [T]}> {
    readonly actor: St.BoxLayout;
    readonly #items = new Map<T, Item>();
    readonly #wrap: boolean;
    #rows: readonly number[] = [];
    #selected: T;

    constructor(options: readonly {id: T; label: string}[], selected: T, styleClass: string, wrap = false) {
        super();
        this.#selected = selected;
        this.#wrap = wrap;
        const actorClass = `frodo-segmented ${styleClass}`.trim();
        this.actor = wrap
            ? new St.BoxLayout({style_class: actorClass, orientation: Clutter.Orientation.VERTICAL, x_expand: true})
            : new St.BoxLayout({style_class: actorClass, y_align: Clutter.ActorAlign.CENTER});
        for (const {id, label: text} of options) {
            const count = label('', 'frodo-segmented-count frodo-mono');
            count.visible = false;
            const content = new St.BoxLayout({style_class: 'frodo-segmented-content', y_align: Clutter.ActorAlign.CENTER});
            content.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(count);
            const button = new St.Button({
                style_class: 'frodo-segmented-item',
                child: content,
                can_focus: true,
                checked: id === selected,
                y_align: Clutter.ActorAlign.CENTER,
                accessible_name: text,
            });
            button.connect('clicked', () => {
                this.#select(id);
            });
            this.#items.set(id, {button, count});
        }
        if (!wrap) {
            for (const {button} of this.#items.values()) this.actor.add_child(button);
            return;
        }
        const row = rowBox();
        for (const {button} of this.#items.values()) row.add_child(button);
        this.actor.add_child(row);
        this.#rows = [this.#items.size];
        this.actor.connect('notify::width', () => {
            this.#reflow();
        });
    }

    #reflow(): void {
        if (!this.actor.mapped) return;
        const buttons = [...this.#items.values()].map(({button}) => button);
        const width = allocatedWidth(this.actor);
        const rows: number[] = [];
        let used = 0;
        let size = 0;
        for (const button of buttons) {
            const [, natural] = button.get_preferred_width(-1);
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
        for (const button of buttons) button.get_parent()?.remove_child(button);
        this.actor.destroy_all_children();
        let next = 0;
        for (const size of rows) {
            const row = rowBox();
            for (const button of buttons.slice(next, next + size)) row.add_child(button);
            next += size;
            this.actor.add_child(row);
        }
    }

    setCounts(counts: Partial<Record<T, number>>): void {
        for (const [id, {count}] of this.#items) {
            const value = counts[id];
            count.visible = typeof value === 'number';
            count.text = typeof value === 'number' ? String(value) : '';
        }
        if (this.#wrap) this.#reflow();
    }

    #select(id: T): void {
        if (id === this.#selected) return;
        this.#selected = id;
        for (const [item, {button}] of this.#items) button.checked = item === id;
        this.emit('changed', id);
    }

    destroy(): void {
        this.clearListeners();
        this.actor.destroy();
    }
}
