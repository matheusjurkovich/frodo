import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {CardId} from '../../core/types.js';
import type {FrodoSettings} from '../../services/settings.js';
import {Disposables} from '../../util/disposables.js';
import {frodoIcon} from '../icons.js';
import {card, cardTitle} from './card.js';
import {column, label, row} from './layout.js';
import type {Component} from './lifecycle.js';

export class CollapsibleCard implements Component {
    readonly actor = card('frodo-collapsible');
    readonly body = column('frodo-collapsible-body');
    readonly #id: CardId;
    readonly #settings: FrodoSettings;
    readonly #summary = new St.Bin({x_expand: true, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER, visible: false});
    readonly #count = label('', 'frodo-collapsible-count');
    readonly #caret = new St.Icon({
        gicon: frodoIcon('expand'),
        style_class: 'frodo-collapsible-caret',
        y_align: Clutter.ActorAlign.CENTER,
    });
    readonly #disposables = new Disposables();

    constructor(id: CardId, title: string, settings: FrodoSettings) {
        this.#id = id;
        this.#settings = settings;

        const content = row('frodo-collapsible-header-content');
        for (const child of [cardTitle(title), this.#summary, this.#count, this.#caret]) content.add_child(child);
        const header = new St.Button({
            style_class: 'frodo-collapsible-header',
            child: content,
            can_focus: true,
            x_expand: true,
            accessible_name: title,
        });
        header.connect('clicked', () => {
            this.#toggle();
        });
        this.actor.add_child(header);
        this.actor.add_child(this.body);

        this.#caret.set_pivot_point(0.5, 0.5);
        this.#count.visible = false;
        this.#disposables.add(
            settings.onChanged('collapsed-cards', () => {
                this.#sync();
            }),
        );
        this.#sync();
    }

    setCount(count: number | null): void {
        this.#count.text = count === null ? '' : String(count);
        this.#count.visible = count !== null;
    }

    setSummary(actor: Clutter.Actor | null): void {
        const current = this.#summary.get_child();
        if (actor === current) return;
        this.#summary.set_child(actor);
        current?.destroy();
        this.#sync();
    }

    #toggle(): void {
        const cards = this.#settings.collapsedCards;
        this.#settings.collapsedCards = cards.includes(this.#id) ? cards.filter(id => id !== this.#id) : [...cards, this.#id];
    }

    #sync(): void {
        const collapsed = this.#settings.collapsedCards.includes(this.#id);
        this.body.visible = !collapsed;
        this.#caret.rotation_angle_z = collapsed ? 0 : 180;
        this.#summary.visible = collapsed && this.#summary.get_child() !== null;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
