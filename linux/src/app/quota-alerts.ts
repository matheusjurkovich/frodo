import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type {ClaudeService} from '../features/claude/claude-service.js';
import {codexMeters} from '../features/codex/codex-usage.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import {geminiMeters} from '../features/gemini/gemini-usage.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import {Disposables} from '../shared/disposables.js';
import type {Level} from '../shared/level.js';
import {quotaNotices} from '../shared/meter.js';
import type {QuotaReading} from '../shared/meter.js';

export interface QuotaAlertsDependencies {
    readonly settings: FrodoSettings;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
}

const WINDOW_NAMES: Readonly<Record<string, string>> = {session: '5 h', weekly: 'semana', daily: 'dia'};

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

    #readings(): QuotaReading[] {
        const {settings, claude, codex, gemini} = this.#deps;
        const readings: QuotaReading[] = [];
        const active = claude.active;
        if (settings.providerEnabled('claude') && active)
            for (const window of active.windows)
                if (window.role === 'session' || window.role === 'weekly')
                    readings.push({
                        id: `claude:${active.profile.configDir}:${window.role}`,
                        name: 'Claude',
                        window: WINDOW_NAMES[window.role] ?? window.role,
                        percent: window.utilization,
                    });
        if (settings.providerEnabled('codex'))
            for (const meter of codexMeters(codex.limits, Date.now()))
                readings.push({
                    id: `codex:${meter.key}`,
                    name: 'Codex',
                    window: WINDOW_NAMES[meter.key] ?? meter.label,
                    percent: meter.percent,
                });
        if (settings.providerEnabled('gemini'))
            for (const meter of geminiMeters(gemini.quota).filter(({key}) => key === 'daily'))
                readings.push({id: 'gemini:daily', name: 'Gemini', window: 'dia', percent: meter.percent});
        return readings;
    }

    #check(): void {
        const {states, notices} = quotaNotices(this.#states, this.#readings());
        this.#states = states;
        if (this.#deps.settings.notifyQuota) for (const {title, body} of notices) Main.notify(title, body);
    }

    destroy(): void {
        this.#disposables.dispose();
    }
}
