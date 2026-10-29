import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {TabId} from '../settings/schema-values.js';
import {Emitter} from '../shared/emitter.js';
import {SPRING} from '../shared/spring.js';
import {chip} from '../shared/ui/buttons.js';
import type {Component} from '../shared/ui/lifecycle.js';
import {frodoIcon} from '../shared/ui/icons.js';
import {springEase} from '../shared/ui/motion.js';
import type {FrodoIconName} from '../shared/ui/icons.js';

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
    readonly actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, x_align: Clutter.ActorAlign.CENTER});
    readonly #indicator = new St.Widget({
        style_class: 'frodo-tab-indicator',
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.START,
        visible: false,
    });
    readonly #row = new St.BoxLayout({style_class: 'frodo-tabbar'});
    readonly #items = new Map<TabId, TabItem>();
    #selected: St.Button | null = null;

    constructor(specs: readonly TabSpec[]) {
        super();
        this.actor.add_child(this.#indicator);
        this.actor.add_child(this.#row);
        this.#row.connect('notify::allocation', () => {
            if (!this.#indicator.get_transition('x')) this.#place(false);
        });
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
            this.#row.add_child(button);
            this.#items.set(id, {button, badge});
        }
    }

    setVisible(ids: readonly TabId[]): void {
        for (const [id, {button}] of this.#items) button.visible = ids.includes(id);
        ids.forEach((id, index) => {
            const button = this.#items.get(id)?.button;
            if (button) this.#row.set_child_at_index(button, index);
        });
    }

    select(id: TabId | null, animate = false): void {
        for (const [tab, {button}] of this.#items) button.checked = tab === id;
        this.#selected = id === null ? null : (this.#items.get(id)?.button ?? null);
        this.#place(animate);
    }

    #place(animate: boolean): void {
        const button = this.#selected;
        const indicator = this.#indicator;
        if (!button?.visible) {
            indicator.hide();
            return;
        }
        const row = this.#row.allocation;
        const box = button.allocation;
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
