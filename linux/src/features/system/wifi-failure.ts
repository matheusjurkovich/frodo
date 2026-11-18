import {DEVICE_STATE, PASSWORD_REASONS} from './wifi-failure.const.js';
import type {WifiAttempt, WifiFault, WifiResolution} from './wifi-failure.types.js';

export class WifiFailureTracker {
    #attempt: WifiAttempt | null = null;
    #failure: WifiFault | null = null;
    #resolution: WifiResolution | null = null;

    get failure(): WifiFault | null {
        return this.#failure;
    }

    get resolution(): WifiResolution | null {
        return this.#resolution;
    }

    observe(state: number, reason: number, attempt: WifiAttempt | null): boolean {
        if (state >= DEVICE_STATE.PREPARE && state <= DEVICE_STATE.SECONDARIES) {
            this.#attempt = attempt ?? this.#attempt;
            return false;
        }
        if (state === DEVICE_STATE.FAILED) {
            const known = this.#attempt;
            this.#attempt = null;
            if (!known) return false;
            this.#failure = {network: known.id, uuid: known.uuid, reason: PASSWORD_REASONS.includes(reason) ? 'password' : 'other'};
            this.#resolution = null;
            return true;
        }
        if (state === DEVICE_STATE.ACTIVATED) {
            const active = attempt ?? this.#attempt;
            this.#attempt = null;
            return this.clear(active?.uuid === this.#failure?.uuid ? 'connected' : 'switched');
        }
        if (state === DEVICE_STATE.UNAVAILABLE) {
            this.#attempt = null;
            return this.clear('off');
        }
        return false;
    }

    clear(resolution: WifiResolution): boolean {
        if (this.#failure === null) return false;
        this.#failure = null;
        this.#resolution = resolution;
        return true;
    }
}
