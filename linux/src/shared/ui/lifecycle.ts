import type Clutter from 'gi://Clutter';

import type {Disposer} from '../disposables.js';

export interface Component {
    readonly actor: Clutter.Actor;
    destroy(): void;
}

export function whileMapped(actor: Clutter.Actor, start: () => void, stop: () => void): Disposer {
    let running = false;
    const sync = (): void => {
        if (actor.mapped === running) return;
        running = actor.mapped;
        if (running) start();
        else stop();
    };
    const id = actor.connect('notify::mapped', sync);
    sync();
    return () => {
        actor.disconnect(id);
        if (!running) return;
        running = false;
        stop();
    };
}
