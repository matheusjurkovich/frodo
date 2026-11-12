import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Disposables} from '../shared/disposables.js';
import type {Disposer} from '../shared/disposables.types.js';
import {watchTopEdge} from '../shared/shell-internals.js';
import {Timer} from '../shared/timer.js';
import {EDGE_GRACE_MS, CLOSE_DELAY_MS, AUTO_CLOSE_MS, OPEN_DELAY_MS} from './island-pointer.const.js';
import type {IslandPointerDependencies} from './island-pointer.types.js';

function pressedButton(event: Clutter.Event, root: Clutter.Actor): boolean {
    for (let actor: Clutter.Actor | null = global.stage.get_event_actor(event); actor && actor !== root; actor = actor.get_parent())
        if (actor instanceof St.Button) return true;
    return false;
}

export class IslandPointer {
    readonly #dependencies: IslandPointerDependencies;
    readonly #disposables = new Disposables();
    readonly #openTimer = this.#disposables.own(new Timer());
    readonly #closeTimer = this.#disposables.own(new Timer());
    #holds = 0;
    #edgeWatch: Disposer | null = null;

    constructor(dependencies: IslandPointerDependencies) {
        this.#dependencies = dependencies;
        const {pill, panel, tongue} = dependencies;
        const actor = pill.actor;
        this.#disposables.signal(
            actor,
            actor.connect('notify::hover', () => {
                this.#onPillHover();
            }),
        );
        this.#disposables.signal(
            actor,
            actor.connect('button-press-event', (_actor, event) => {
                if (pressedButton(event, actor)) return Clutter.EVENT_PROPAGATE;
                if (event.get_button() === Clutter.BUTTON_PRIMARY && !pill.activate()) dependencies.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.#disposables.signal(
            actor,
            actor.connect('button-release-event', (_actor, event) =>
                pressedButton(event, actor) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP,
            ),
        );
        this.#disposables.signal(
            tongue,
            tongue.connect('notify::hover', () => {
                this.#onTongueHover();
            }),
        );
        this.#disposables.signal(
            tongue,
            tongue.connect('button-press-event', () => {
                dependencies.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.watchTopEdge();
        this.#disposables.add(() => {
            this.#edgeWatch?.();
            this.#edgeWatch = null;
        });
        this.#disposables.signal(
            panel,
            panel.connect('notify::hover', () => {
                this.syncPanel();
            }),
        );
    }

    hold(menu: PopupMenu.PopupMenu): Disposer {
        let held = false;
        const id = menu.connect('open-state-changed', (_menu, open) => {
            if (open === held) return;
            held = open;
            this.#holds += open ? 1 : -1;
            this.syncPanel();
        });
        return () => {
            menu.disconnect(id);
            if (!held) return;
            held = false;
            this.#holds--;
            this.syncPanel();
        };
    }

    cancelOpen(): void {
        this.#openTimer.stop();
    }

    cancel(): void {
        this.#openTimer.stop();
        this.#closeTimer.stop();
    }

    watchTopEdge(): void {
        this.#edgeWatch?.();
        this.#edgeWatch = null;
        const span = this.#dependencies.placement.topEdge();
        if (!span) return;
        const {pill, panel, settings} = this.#dependencies;
        this.#edgeWatch = watchTopEdge(span, () => {
            if (this.#dependencies.isOpen() || this.#dependencies.covered() || pill.hasAction || !settings.openOnHover) return;
            this.#dependencies.open('hover');
            this.#closeTimer.once(EDGE_GRACE_MS, () => {
                if (!panel.hover && this.#holds === 0) this.#dependencies.close();
            });
        });
    }

    syncPanel(): void {
        const {panel, settings} = this.#dependencies;
        if (!this.#dependencies.isOpen()) return;
        if (panel.hover || this.#holds > 0) this.#closeTimer.stop();
        else if (this.#dependencies.openedBy() === 'hover')
            this.#closeTimer.once(CLOSE_DELAY_MS, () => {
                this.#dependencies.close();
            });
        else if (settings.autoClose)
            this.#closeTimer.once(AUTO_CLOSE_MS, () => {
                this.#dependencies.close();
            });
    }

    destroy(): void {
        this.#disposables.dispose();
    }

    #onPillHover(): void {
        const {pill, settings} = this.#dependencies;
        if (this.#dependencies.isOpen()) return;
        if (pill.actor.hover && settings.openOnHover && !pill.hasAction) this.#openSoon();
        else this.#openTimer.stop();
    }

    #onTongueHover(): void {
        if (this.#dependencies.isOpen()) return;
        if (this.#dependencies.tongue.hover && this.#dependencies.settings.openOnHover) this.#openSoon();
        else this.#openTimer.stop();
    }

    #openSoon(): void {
        this.#openTimer.once(OPEN_DELAY_MS, () => {
            this.#dependencies.open('hover');
        });
    }
}
