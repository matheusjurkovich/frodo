import {Disposables} from '../shared/disposables.js';
import type {Level} from '../shared/level.types.js';
import {quotaNotices} from '../shared/meter.js';
import {quotaReadings} from './quota-readings.js';
import type {QuotaAlertsDependencies} from './quota-alerts.types.js';

export class QuotaAlerts {
    readonly #deps: QuotaAlertsDependencies;
    readonly #disposables = new Disposables();
    #states = new Map<string, Level>();

    constructor(deps: QuotaAlertsDependencies) {
        this.#deps = deps;
        const check = (): void => {
            this.#check();
        };
        this.#disposables.add(deps.claude.on('changed', check));
        this.#disposables.add(deps.codex.on('changed', check));
        this.#disposables.add(deps.gemini.on('changed', check));
        this.#check();
    }

    #check(): void {
        const {settings, claude, codex, gemini} = this.#deps;
        const active = claude.active;
        const {states, notices} = quotaNotices(
            this.#states,
            quotaReadings({
                claude: active ? {configDir: active.profile.configDir, windows: active.windows} : null,
                codex: codex.limits,
                gemini: gemini.quota,
                enabled: provider => settings.providerEnabled(provider),
                nowMs: Date.now(),
            }),
        );
        this.#states = states;
        if (settings.notifyQuota) for (const {provider, title, body} of notices) this.#deps.notifier.notify(provider, title, body);
    }

    destroy(): void {
        this.#disposables.dispose();
    }
}
