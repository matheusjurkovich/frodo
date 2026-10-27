import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {TabId} from '../../core/types.js';
import {Emitter} from '../../util/emitter.js';
import {chip} from '../components/buttons.js';
import type {Component} from '../components/lifecycle.js';
import {frodoIcon} from '../icons.js';
import type {FrodoIconName} from '../icons.js';

export interface TabSpec {
    readonly id: TabId;
    readonly icon: FrodoIconName;
    readonly label: string;
    create(): Component;
}

interface TabItem {
    readonly button: St.Button;
    readonly badge: St.Label;
}

export class TabBar extends Emitter<{selected: [TabId]}> {
    readonly actor = new St.BoxLayout({style_class: 'frodo-tabbar', x_expand: true, x_align: Clutter.ActorAlign.CENTER});
    readonly #items = new Map<TabId, TabItem>();

    constructor(specs: readonly TabSpec[]) {
        super();
        for (const {id, icon, label} of specs) {
            const badge = chip('0', 'counter');
            badge.visible = false;
            const content = new St.BoxLayout({style_class: 'frodo-tab-content', y_align: Clutter.ActorAlign.CENTER});
            content.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-tab-icon', y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(badge);
            const button = new St.Button({
                style_class: 'frodo-tab',
                child: content,
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
                accessible_name: label,
            });
            button.connect('clicked', () => {
                this.emit('selected', id);
            });
            this.actor.add_child(button);
            this.#items.set(id, {button, badge});
        }
    }

    setVisible(ids: readonly TabId[]): void {
        for (const [id, {button}] of this.#items) button.visible = ids.includes(id);
    }

    select(id: TabId | null): void {
        for (const [tab, {button}] of this.#items) button.checked = tab === id;
    }

    setBadge(id: TabId, count: number): void {
        const badge = this.#items.get(id)?.badge;
        if (!badge) return;
        badge.text = String(count);
        badge.visible = count > 0;
    }

    destroy(): void {
        this.clearListeners();
        this.actor.destroy();
    }
}
