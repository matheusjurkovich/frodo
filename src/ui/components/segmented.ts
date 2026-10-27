import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Emitter} from '../../util/emitter.js';
import {label} from './layout.js';

interface Item {
    readonly button: St.Button;
    readonly count: St.Label;
}

export class Segmented<T extends string> extends Emitter<{changed: [T]}> {
    readonly actor: St.BoxLayout;
    readonly #items = new Map<T, Item>();
    #selected: T;

    constructor(options: readonly {id: T; label: string}[], selected: T, styleClass: string) {
        super();
        this.#selected = selected;
        this.actor = new St.BoxLayout({style_class: `frodo-segmented ${styleClass}`.trim(), y_align: Clutter.ActorAlign.CENTER});
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
            this.actor.add_child(button);
            this.#items.set(id, {button, count});
        }
    }

    setCounts(counts: Partial<Record<T, number>>): void {
        for (const [id, {count}] of this.#items) {
            const value = counts[id];
            count.visible = typeof value === 'number';
            count.text = typeof value === 'number' ? String(value) : '';
        }
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
