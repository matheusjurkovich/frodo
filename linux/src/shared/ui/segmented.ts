import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Emitter} from '../emitter.js';
import {SPRING} from '../spring.js';
import {allocatedWidth, label} from './layout.js';
import {springEase} from './motion.js';

const WRAP_SPACING = 6;

interface Item {
    readonly button: St.Button;
    readonly count: St.Label;
}

function rowBox(): St.BoxLayout {
    return new St.BoxLayout({style_class: 'frodo-segmented-row', x_expand: true});
}

export class Segmented<T extends string> extends Emitter<{changed: [T]}> {
    readonly actor: St.Widget;
    readonly #items = new Map<T, Item>();
    readonly #wrap: boolean;
    readonly #row = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
    readonly #indicator = new St.Widget({
        style_class: 'frodo-segmented-indicator',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.START,
        visible: false,
    });
    #rows: readonly number[] = [];
    #selected: T;

    constructor(options: readonly {id: T; label: string}[], selected: T, styleClass: string, wrap = false) {
        super();
        this.#selected = selected;
        this.#wrap = wrap;
        const actorClass = `frodo-segmented ${styleClass}`.trim();
        this.actor = wrap
            ? new St.BoxLayout({style_class: actorClass, orientation: Clutter.Orientation.VERTICAL, x_expand: true})
            : new St.Widget({style_class: actorClass, layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER});
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
            for (const {button} of this.#items.values()) this.#row.add_child(button);
            this.actor.add_child(this.#indicator);
            this.actor.add_child(this.#row);
            this.#row.connect('notify::allocation', () => {
                if (!this.#indicator.get_transition('x')) this.#place(false);
            });
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

    set selected(id: T) {
        if (id === this.#selected) return;
        this.#selected = id;
        for (const [item, {button}] of this.#items) button.checked = item === id;
        if (!this.#wrap) this.#place(true);
    }

    #place(animate: boolean): void {
        const button = this.#items.get(this.#selected)?.button;
        const indicator = this.#indicator;
        const row = this.#row.allocation;
        const box = button?.allocation;
        if (!box || box.get_width() <= 0) {
            indicator.hide();
            return;
        }
        const target = {x: row.x1 + box.x1, y: row.y1 + box.y1, width: box.get_width(), height: box.get_height()};
        if (animate && indicator.visible && indicator.mapped) {
            springEase(indicator, target, SPRING);
            return;
        }
        indicator.remove_all_transitions();
        indicator.set_position(target.x, target.y);
        indicator.set_size(target.width, target.height);
        indicator.show();
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
