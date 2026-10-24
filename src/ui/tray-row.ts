import type Clutter from 'gi://Clutter';
import St from 'gi://St';

import {appIndicators} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import type {Disposer} from '../util/disposables.js';
import type {Island} from './island.js';

interface Borrowed {
    readonly container: Clutter.Actor;
    readonly parent: Clutter.Actor;
    readonly index: number;
    readonly release: Disposer;
}

export class TrayRow {
    readonly actor = new St.BoxLayout({style_class: 'frodo-tray', visible: false});
    readonly #island: Island;
    readonly #disposables = new Disposables();
    #borrowed: Borrowed[] = [];

    constructor(island: Island) {
        this.#island = island;
        this.#disposables.add(
            island.on('opening', () => {
                this.#borrow();
            }),
        );
        this.#disposables.add(
            island.on('closed', () => {
                this.#giveBack();
            }),
        );
    }

    #borrow(): void {
        this.#giveBack();
        for (const {container, menu} of appIndicators()) {
            const parent = container.get_parent();
            if (!parent) continue;
            const release = new Disposables();
            const entry: Borrowed = {
                container,
                parent,
                index: parent.get_children().indexOf(container),
                release: () => {
                    release.dispose();
                },
            };
            release.signal(
                container,
                container.connect('destroy', () => {
                    this.#borrowed = this.#borrowed.filter(item => item !== entry);
                    this.actor.visible = this.#borrowed.length > 0;
                }),
            );
            if (menu) release.add(this.#island.holdWhileOpen(menu));
            parent.remove_child(container);
            this.actor.add_child(container);
            this.#borrowed.push(entry);
        }
        this.actor.visible = this.#borrowed.length > 0;
    }

    #giveBack(): void {
        for (const {container, parent, index, release} of [...this.#borrowed].reverse()) {
            release();
            this.actor.remove_child(container);
            parent.insert_child_at_index(container, Math.min(index, parent.get_n_children()));
        }
        this.#borrowed = [];
        this.actor.visible = false;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#giveBack();
        this.actor.destroy();
    }
}
