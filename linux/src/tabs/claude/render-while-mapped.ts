import type Clutter from 'gi://Clutter';
import type {Disposer} from '../../shared/disposables.types.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {MappedHooks, Subscription} from './render-while-mapped.types.js';

export function renderWhileMapped(
    actor: Clutter.Actor,
    subscriptions: readonly Subscription[],
    render: () => void,
    {start, stop}: MappedHooks = {},
): Disposer {
    const offs = subscriptions.map(subscribe =>
        subscribe(() => {
            if (actor.mapped) render();
        }),
    );
    const offMapped = whileMapped(
        actor,
        () => {
            start?.();
            render();
        },
        () => {
            stop?.();
        },
    );
    return () => {
        offMapped();
        for (const off of offs) off();
    };
}
