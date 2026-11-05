import {STEP_QUIET_MS} from './step-gate.const.js';
import type {GateEntry} from './step-gate.types.js';

export class StepGate {
    readonly #sessions = new Map<string, GateEntry>();

    admits(sessionId: string, step: string, nowMs: number): boolean {
        const entry = this.#sessions.get(sessionId);
        if (entry?.step === step) return entry.admitted;
        const shownAt = entry?.shownAt ?? null;
        const admitted = shownAt === null || nowMs - shownAt >= STEP_QUIET_MS;
        this.#sessions.set(sessionId, {step, admitted, shownAt});
        return admitted;
    }

    shown(sessionId: string, nowMs: number): void {
        const entry = this.#sessions.get(sessionId);
        if (entry) entry.shownAt = nowMs;
    }

    retain(sessionIds: ReadonlySet<string>): void {
        for (const id of this.#sessions.keys()) if (!sessionIds.has(id)) this.#sessions.delete(id);
    }
}
