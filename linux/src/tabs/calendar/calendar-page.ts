import type Clutter from 'gi://Clutter';

import type {CalendarAccounts} from '../../features/meetings/calendar-accounts-service.js';
import {calendarParts, closeDateMenu, spawn, styleCalendar} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import {ActorLoan} from '../../shared/ui/actor-loan.js';
import {FaultBanner} from '../../shared/ui/fault-banner.js';
import {column, row} from '../../shared/ui/layout.js';
import {whileShown} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';

export class CalendarPage implements Component {
    readonly actor = column('frodo-section');
    readonly #banner = new FaultBanner();
    readonly #month = column('frodo-calendar-month');
    readonly #events = column('frodo-calendar-events');
    readonly #island: IslandHandle;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();
    #faulted = false;

    constructor(island: IslandHandle, calendar: CalendarAccounts, openSettings: () => void) {
        this.#island = island;
        this.#month.x_expand = false;
        const cols = row('frodo-calendar');
        cols.add_child(this.#month);
        cols.add_child(this.#events);
        this.actor.add_child(this.#banner.actor);
        this.actor.add_child(cols);
        const syncBanner = (): void => {
            const attention = calendar.attention;
            if (attention) {
                this.#faulted = true;
                this.#banner.show({
                    tone: 'warn',
                    title: 'A Agenda não sincroniza',
                    body: `O ${attention.provider} pediu para você entrar de novo. Os eventos abaixo podem estar desatualizados.`,
                    primary: {
                        label: 'Entrar de novo',
                        run: () => {
                            spawn(['gnome-control-center', 'online-accounts']);
                            island.close();
                        },
                    },
                    secondary: {label: 'Abrir configurações da Agenda', run: openSettings},
                });
                return;
            }
            if (this.#faulted) this.#banner.done('Agenda sincronizada agora.');
            this.#faulted = false;
        };
        this.#disposables.add(calendar.on('changed', syncBanner));
        syncBanner();
        this.#disposables.add(
            whileShown(
                this.actor,
                island,
                () => {
                    this.#borrow();
                },
                () => {
                    calendarParts()?.selectToday();
                    this.#loan.dispose();
                },
            ),
        );
    }

    #borrow(): void {
        this.#loan.dispose();
        closeDateMenu();
        const parts = calendarParts();
        if (!parts?.month.get_parent() || !parts.events.get_parent()) return;
        parts.selectToday();
        this.#lend(parts.month, this.#month);
        this.#lend(parts.events, this.#events);
        this.#loan.add(styleCalendar());
        this.#connect(parts.events, 'clicked', () => {
            this.#island.close();
        });
        const syncVisible = (): void => {
            this.#events.visible = parts.events.visible;
        };
        this.#connect(parts.events, 'notify::visible', syncVisible);
        syncVisible();
    }

    #connect(actor: Clutter.Actor, signal: string, handler: () => void): void {
        const id = actor.connect(signal, handler);
        this.#loan.add(() => {
            actor.disconnect(id);
        });
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
        this.#banner.destroy();
        this.actor.destroy();
    }
}
