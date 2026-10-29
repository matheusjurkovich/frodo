import type Clutter from 'gi://Clutter';

import type {Disposer} from '../disposables.js';
import type {IslandHandle} from '../island-handle.js';

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

export function whileShown(page: Clutter.Actor, island: IslandHandle, start: () => void, stop: () => void): Disposer {
    let open = false;
    let running = false;
    const sync = (): void => {
        if (running || !open || !page.visible) return;
        running = true;
        start();
    };
    const halt = (): void => {
        open = false;
        if (!running) return;
        running = false;
        stop();
    };
    const offOpening = island.on('opening', () => {
        open = true;
        sync();
    });
    const offClosed = island.on('closed', halt);
    const id = page.connect('notify::visible', sync);
    return () => {
        offOpening();
        offClosed();
        page.disconnect(id);
        halt();
    };
}
