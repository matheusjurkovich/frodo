import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {TabId} from '../settings/schema-values.types.js';
import {Emitter} from '../shared/emitter.js';
import {chip, contentButton} from '../shared/ui/buttons.js';
import {frodoIcon} from '../shared/ui/icons.js';
import {SlidingIndicator} from '../shared/ui/sliding-indicator.js';
import {TAB_SPECS} from './tab-bar.const.js';
import type {TabItem} from './tab-bar.types.js';

export class TabBar extends Emitter<{selected: [TabId]}> {
    readonly actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true, x_align: Clutter.ActorAlign.CENTER});
    readonly #row = new St.BoxLayout({style_class: 'frodo-tabbar'});
    readonly #indicator = new SlidingIndicator('frodo-tab-indicator', this.#row, () => this.#selected);
    readonly #items = new Map<TabId, TabItem>();
    #selected: St.Button | null = null;

    constructor() {
        super();
        this.actor.add_child(this.#indicator.actor);
        this.actor.add_child(this.#row);
        for (const {id, icon, label} of TAB_SPECS) {
            const badge = chip('0', 'counter');
            badge.visible = false;
            const content = new St.BoxLayout({style_class: 'frodo-tab-content', y_align: Clutter.ActorAlign.CENTER});
            content.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-tab-icon', y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER}));
            content.add_child(badge);
            const button = contentButton(
                'frodo-tab',
                content,
                () => {
                    this.emit('selected', id);
                },
                {y_align: Clutter.ActorAlign.CENTER, accessible_name: label},
            );
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
        this.#indicator.place(animate);
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
