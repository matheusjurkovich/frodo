import {doneMessage, finishedSessions} from './claude-sessions.js';
import type {SessionState} from './claude-sessions.js';
import type {ClaudeSessions} from './claude-sessions-service.js';
import type {Unsubscribe} from '../../shared/emitter.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {ProviderNotifier} from '../../shared/ui/provider-notifier.js';

export class DoneAlert {
    readonly #off: Unsubscribe;
    #previous: readonly SessionState[];

    constructor(settings: FrodoSettings, sessions: Pick<ClaudeSessions, 'sessions' | 'on'>, notifier: Pick<ProviderNotifier, 'notify'>) {
        this.#previous = sessions.sessions;
        this.#off = sessions.on('changed', () => {
            const next = sessions.sessions;
            const finished = finishedSessions(this.#previous, next);
            this.#previous = next;
            if (settings.notifyDone) for (const state of finished) notifier.notify(state.provider, 'Pronto', doneMessage(state));
        });
    }

    destroy(): void {
        this.#off();
    }
}
