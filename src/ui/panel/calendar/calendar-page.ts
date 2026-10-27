import type Clutter from 'gi://Clutter';

import {calendarParts} from '../../../shell/internals.js';
import {Disposables} from '../../../util/disposables.js';
import {ActorLoan} from '../../actor-loan.js';
import {column, row} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import type {Island} from '../../island.js';

export class CalendarPage implements Component {
    readonly actor = row('frodo-calendar');
    readonly #month = column('frodo-calendar-month');
    readonly #events = column('frodo-calendar-events');
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

    constructor(island: Island) {
        this.#month.x_expand = false;
        this.actor.add_child(this.#month);
        this.actor.add_child(this.#events);
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
        const parts = calendarParts();
        if (!parts?.month.get_parent() || !parts.events.get_parent()) return;
        parts.selectToday();
        this.#lend(parts.month, this.#month);
        this.#lend(parts.events, this.#events);
    }

    #lend(item: Clutter.Actor, target: Clutter.Actor): void {
        const loan = new ActorLoan(item, target);
        this.#loan.add(() => {
            loan.giveBack();
        });
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#loan.dispose();
        this.actor.destroy();
    }
}
