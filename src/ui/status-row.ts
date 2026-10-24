import St from 'gi://St';

import {panelStatusItems} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {ActorLoan} from './actor-loan.js';
import type {Island} from './island.js';

export class StatusRow {
    readonly actor = new St.BoxLayout({style_class: 'frodo-tray', visible: false});
    readonly #island: Island;
    readonly #disposables = new Disposables();
    readonly #loans = new Disposables();
    #count = 0;

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
        for (const {container, menu} of panelStatusItems()) {
            if (!container.get_parent()) continue;
            const loan = new ActorLoan(container, this.actor);
            const inner = container.get_first_child() ?? container;
            const visibleId = inner.connect('notify::visible', () => {
                this.#syncVisibility();
            });
            this.#loans.add(() => {
                if (loan.alive) inner.disconnect(visibleId);
                loan.giveBack();
            });
            if (menu) this.#loans.add(this.#island.holdWhileOpen(menu));
            this.#count++;
        }
        this.#syncVisibility();
    }

    #syncVisibility(): void {
        this.actor.visible =
            this.#count > 0 && this.actor.get_children().some(child => child.visible && (child.get_first_child() ?? child).visible);
    }

    #giveBack(): void {
        this.#loans.dispose();
        this.#count = 0;
        this.actor.visible = false;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#giveBack();
        this.actor.destroy();
    }
}
