import {DEVICE_STATE, PASSWORD_REASONS} from './wifi-failure.const.js';
import type {WifiAttempt, WifiFault} from './wifi-failure.types.js';

export class WifiFailureTracker {
    #attempt: WifiAttempt | null = null;
    #failure: WifiFault | null = null;

    get failure(): WifiFault | null {
        return this.#failure;
    }

    observe(state: number, reason: number, attempt: WifiAttempt | null): boolean {
        if (state >= DEVICE_STATE.PREPARE && state <= DEVICE_STATE.SECONDARIES) {
            this.#attempt = attempt ?? this.#attempt;
            return this.clear();
        }
        if (state === DEVICE_STATE.FAILED) {
            const known = this.#attempt;
            this.#attempt = null;
            if (!known) return false;
            this.#failure = {network: known.id, uuid: known.uuid, reason: PASSWORD_REASONS.includes(reason) ? 'password' : 'other'};
            return true;
        }
        if (state === DEVICE_STATE.ACTIVATED || state === DEVICE_STATE.UNAVAILABLE) {
            this.#attempt = null;
            return this.clear();
        }
        return false;
    }

    clear(): boolean {
        const had = this.#failure !== null;
        this.#failure = null;
        return had;
    }
}
