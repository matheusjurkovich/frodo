import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import {isActiveProfile} from '../core/claude-profiles.js';
import type {ClaudeProfile} from '../core/claude-profiles.js';
import {accountSummary, claudeErrorMessage, normalizeSpend, normalizeWindows, tierLabel} from '../core/claude-usage.js';
import type {Spend, UsageWindow} from '../core/claude-usage.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {ClaudeApiError, ClaudeClient, SignedOutError, defaultConfigDir, soupTransport} from './claude-client.js';
import {ensureProfiles} from './claude-profiles.js';
import type {FrodoSettings} from './settings.js';

const MIN_REFRESH_MS = 60 * 1000;
const TIMEOUT_SECONDS = 15;

export type ProfileStatus = 'loading' | 'ok' | 'error' | 'signed-out';

export interface ProfileUsage {
    readonly profile: ClaudeProfile;
    readonly active: boolean;
    readonly status: ProfileStatus;
    readonly windows: readonly UsageWindow[];
    readonly spend: Spend | null;
    readonly tier: string | null;
    readonly subtitle: string | null;
    readonly error: string | null;
    readonly updatedAt: number;
}

interface Entry {
    readonly client: ClaudeClient;
    usage: ProfileUsage;
}

function initialUsage(profile: ClaudeProfile, active: boolean): ProfileUsage {
    return {profile, active, status: 'loading', windows: [], spend: null, tier: null, subtitle: null, error: null, updatedAt: 0};
}

function errorStatus(error: unknown): {status: number | null; apiMessage: string | null} {
    return error instanceof ClaudeApiError ? {status: error.status, apiMessage: error.apiMessage} : {status: null, apiMessage: null};
}

export class ClaudeService extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    readonly #session = new Soup.Session({timeout: TIMEOUT_SECONDS});
    readonly #cancellable = new Gio.Cancellable();
    readonly #timer = new Timer();
    readonly #disposables = new Disposables();
    #entries: Entry[] = [];
    #lastRefresh = 0;
    #lastFailed = false;
    #destroyed = false;

    constructor(settings: FrodoSettings) {
        super();
        this.#settings = settings;
        this.#disposables.add(
            settings.onChanged('claude-poll-minutes', () => {
                this.#schedule();
            }),
        );
        this.#disposables.add(
            settings.onChanged('claude-profiles', () => {
                this.#rebuild(settings.claudeProfiles);
            }),
        );
        void ensureProfiles(settings).then(profiles => {
            if (!this.#destroyed) this.#rebuild(profiles);
        });
        this.#schedule();
    }

    get profiles(): readonly ProfileUsage[] {
        return this.#entries.map(entry => entry.usage);
    }

    get active(): ProfileUsage | null {
        return this.profiles.find(usage => usage.active) ?? this.profiles[0] ?? null;
    }

    get lastRefresh(): number {
        return this.#lastRefresh;
    }

    get lastFailed(): boolean {
        return this.#lastFailed;
    }

    refreshIfStale(maxAgeSeconds: number): void {
        if (Date.now() - this.#lastRefresh >= maxAgeSeconds * 1000) void this.refresh(true);
    }

    async refresh(force = false): Promise<void> {
        if (!force && Date.now() - this.#lastRefresh < MIN_REFRESH_MS) return;
        this.#lastRefresh = Date.now();
        const entries = this.#entries;
        await Promise.all(entries.map(entry => this.#refreshEntry(entry)));
        if (this.#destroyed || entries !== this.#entries) return;
        this.#lastFailed = entries.length > 0 && entries.every(entry => entry.usage.status === 'error');
        this.emit('changed');
    }

    #rebuild(profiles: readonly ClaudeProfile[]): void {
        const defaultDir = defaultConfigDir();
        const transport = soupTransport(this.#session, this.#cancellable);
        const hasActive = profiles.some(profile => isActiveProfile(profile, defaultDir));
        this.#entries = profiles.map((profile, index) => {
            const active = hasActive ? isActiveProfile(profile, defaultDir) : index === 0;
            return {client: new ClaudeClient(profile.configDir, transport), usage: initialUsage(profile, active)};
        });
        this.emit('changed');
        void this.refresh(true);
    }

    #schedule(): void {
        this.#timer.every(Math.max(1, this.#settings.claudePollMinutes) * 60, () => {
            void this.refresh();
        });
    }

    #update(entry: Entry, changes: Partial<ProfileUsage>): void {
        entry.usage = {...entry.usage, ...changes};
        if (!this.#destroyed) this.emit('changed');
    }

    async #refreshEntry(entry: Entry): Promise<void> {
        const tier = await entry.client.readTier();
        if (tier.subscriptionType || tier.rateLimitTier) this.#update(entry, {tier: tierLabel(tier.subscriptionType, tier.rateLimitTier)});

        const [usage, profile] = await Promise.allSettled([entry.client.fetchUsage(), entry.client.fetchProfile()]);
        if (this.#destroyed) return;

        if (usage.status === 'rejected') {
            this.#applyError(entry, usage.reason);
            return;
        }
        const account = profile.status === 'fulfilled' ? accountSummary(profile.value) : null;
        this.#update(entry, {
            status: 'ok',
            windows: normalizeWindows(usage.value),
            spend: normalizeSpend(usage.value),
            error: null,
            updatedAt: Date.now(),
            ...(account ? {subtitle: account.subtitle, tier: tierLabel(account.plan, account.rateLimitTier)} : {}),
        });
    }

    #applyError(entry: Entry, error: unknown): void {
        if (error instanceof SignedOutError) {
            this.#update(entry, {status: 'signed-out', windows: [], spend: null, error: 'Sem login do Claude Code neste perfil.'});
            return;
        }
        const {status, apiMessage} = errorStatus(error);
        if (status === 429 && entry.usage.status === 'ok') return;
        this.#update(entry, {status: 'error', error: claudeErrorMessage(status, apiMessage)});
    }

    destroy(): void {
        this.#destroyed = true;
        this.#timer.stop();
        this.#disposables.dispose();
        this.#cancellable.cancel();
        this.#session.abort();
        this.clearListeners();
    }
}
