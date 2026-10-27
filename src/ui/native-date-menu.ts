import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {dateMenuParts} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {ActorLoan} from './actor-loan.js';
import type {Island} from './island.js';

export class NativeDateMenu {
    readonly notifications = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'frodo-messages',
        x_expand: true,
    });
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

    constructor(island: Island) {
        this.#disposables.add(
            island.on('opening', () => {
                this.#borrow();
            }),
        );
        this.#disposables.add(
            island.on('closed', () => {
                this.#loan.dispose();
            }),
        );
    }

    #borrow(): void {
        this.#loan.dispose();
        const parts = dateMenuParts();
        if (!parts?.messageList.get_parent()) return;
        const loan = new ActorLoan(parts.messageList, this.notifications);
        this.#loan.add(() => {
            loan.giveBack();
        });
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#loan.dispose();
        this.notifications.destroy();
    }
}
