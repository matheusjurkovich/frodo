import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Emitter} from '../emitter.js';
import {contentButton} from './buttons.js';
import {label} from './layout.js';
import {SlidingIndicator} from './sliding-indicator.js';
import {Wrap} from './wrap.js';
import type {Item} from './segmented.types.js';

export class Segmented<T extends string> extends Emitter<{changed: [T]}> {
    readonly actor: St.Widget;
    readonly #items = new Map<T, Item>();
    readonly #wrap: Wrap | null = null;
    readonly #indicator: SlidingIndicator | null = null;
    #selected: T;

    constructor(options: readonly {id: T; label: string}[], selected: T, styleClass: string, wrap = false) {
        super();
        this.#selected = selected;
        const actorClass = `frodo-segmented ${styleClass}`.trim();
        for (const {id, label: text} of options) {
            const count = label('', 'frodo-segmented-count frodo-mono');
            count.visible = false;
            const content = new St.BoxLayout({style_class: 'frodo-segmented-content', y_align: Clutter.ActorAlign.CENTER});
            content.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(count);
            const button = contentButton(
                'frodo-segmented-item',
                content,
                () => {
                    this.#select(id);
                },
                {checked: id === selected, y_align: Clutter.ActorAlign.CENTER, accessible_name: text},
            );
            this.#items.set(id, {button, count});
        }
        const buttons = [...this.#items.values()].map(({button}) => button);
        if (wrap) {
            this.#wrap = new Wrap(actorClass, buttons);
            this.actor = this.#wrap.actor;
            return;
        }
        const row = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
        for (const button of buttons) row.add_child(button);
        this.#indicator = new SlidingIndicator('frodo-segmented-indicator', row, () => this.#items.get(this.#selected)?.button ?? null);
        this.actor = new St.Widget({style_class: actorClass, layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER});
        this.actor.add_child(this.#indicator.actor);
        this.actor.add_child(row);
    }

    setCounts(counts: Partial<Record<T, number>>): void {
        for (const [id, {count}] of this.#items) {
            const value = counts[id];
            count.visible = typeof value === 'number';
            count.text = typeof value === 'number' ? String(value) : '';
        }
        this.#wrap?.reflow();
    }

    set selected(id: T) {
        if (id === this.#selected) return;
        this.#selected = id;
        for (const [item, {button}] of this.#items) button.checked = item === id;
        this.#indicator?.place(true);
    }

    #select(id: T): void {
        if (id === this.#selected) return;
        this.selected = id;
        this.emit('changed', id);
    }

    destroy(): void {
        this.clearListeners();
        this.actor.destroy();
    }
}
