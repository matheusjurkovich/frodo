import Clutter from 'gi://Clutter';
import type St from 'gi://St';

import type {ClaudeService} from '../../features/claude/claude-service.js';
import {claudeMeters} from '../../features/claude/claude-usage.js';
import {countByStatus} from '../../features/claude/claude-sessions.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {CodexUsage} from '../../features/codex/codex-service.js';
import {codexMeters, planLabel} from '../../features/codex/codex-usage.js';
import type {GeminiUsage} from '../../features/gemini/gemini-service.js';
import {geminiMeters} from '../../features/gemini/gemini-usage.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {PROVIDER_NAMES} from '../../shared/ai-provider.js';
import type {AiProvider} from '../../shared/ai-provider.js';
import {Disposables} from '../../shared/disposables.js';
import {levelClass} from '../../shared/level.js';
import {meterLevel, shownMeterPercent} from '../../shared/meter.js';
import type {Meter} from '../../shared/meter.js';
import {chip, textButton} from '../../shared/ui/buttons.js';
import {card, cardHeading, emptyState} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, spacer} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {providerTile} from '../../shared/ui/provider-tile.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';

const MAX_AGE_SECONDS = 60;
const GEMINI_PLANS: Readonly<Record<number, string>> = {1000: 'Login Google', 1500: 'Standard', 2000: 'Enterprise'};
const ESTIMATED = 'Estimado pelo histórico local: o Gemini CLI não informa a cota.';

export interface UsageSources {
    readonly settings: FrodoSettings;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
}

interface ProviderUsage {
    readonly meters: (now: number) => Meter[];
    readonly plan: () => string | null;
    readonly empty: () => string;
    readonly refresh: () => void;
    readonly onChanged: (callback: () => void) => () => void;
}

export function providerUsage(provider: AiProvider, {settings, claude, codex, gemini}: UsageSources): ProviderUsage {
    switch (provider) {
        case 'claude':
            return {
                meters: now => claudeMeters(claude.active?.windows ?? [], now),
                plan: () => claude.active?.tier ?? null,
                empty: () => 'Entre no Claude Code para ver as cotas',
                refresh: () => {
                    claude.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => claude.on('changed', callback),
            };
        case 'codex':
            return {
                meters: now => codexMeters(codex.limits, now),
                plan: () => planLabel(codex.limits?.plan ?? null),
                empty: () => (codex.available ? 'O Codex ainda não informou a cota. Use-o uma vez.' : 'Codex não encontrado em ~/.codex'),
                refresh: () => {
                    codex.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => codex.on('changed', callback),
            };
        case 'gemini':
            return {
                meters: () => geminiMeters(gemini.quota),
                plan: () => GEMINI_PLANS[settings.geminiDailyLimit] ?? null,
                empty: () => (gemini.available ? 'Lendo o histórico do Gemini CLI…' : 'Gemini CLI não encontrado em ~/.gemini'),
                refresh: () => {
                    gemini.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => {
                    const off = gemini.on('changed', callback);
                    const offLimit = settings.onChanged('gemini-daily-limit', callback);
                    return () => {
                        off();
                        offLimit();
                    };
                },
            };
    }
}

function note(text: string): St.Label {
    const result = label(text, 'frodo-meter-note');
    result.clutter_text.line_wrap = true;
    return result;
}

function meterView(meter: Meter, provider: AiProvider, remaining: boolean, short: boolean): St.BoxLayout {
    const shown = shownMeterPercent(meter.percent, remaining);
    const level = meterLevel(meter.percent);
    const root = column('frodo-meter');
    const top = row('frodo-meter-top');
    top.add_child(label(short ? meter.short : meter.label, 'frodo-meter-name'));
    top.add_child(spacer());
    top.add_child(label(`${Math.round(shown)}%`, 'frodo-meter-value frodo-mono'));
    root.add_child(top);
    const bar = new SegmentBar();
    const fill = `frodo-fill-${provider}`;
    bar.segments = [{fraction: shown / 100, styleClass: level === 'ok' ? fill : `${fill} ${levelClass(level)}`}];
    root.add_child(bar.actor);
    if (meter.note !== '') root.add_child(label(meter.note, 'frodo-meter-note'));
    return root;
}

function heading(provider: AiProvider, title: string): St.BoxLayout {
    const top = row('frodo-provider-heading');
    top.add_child(providerTile(provider, 28));
    const text = cardHeading(title);
    text.x_expand = true;
    text.y_align = Clutter.ActorAlign.CENTER;
    top.add_child(text);
    return top;
}

export class MetersCard implements Component {
    readonly actor = card('frodo-limits');
    readonly #provider: AiProvider;
    readonly #usage: ProviderUsage;
    readonly #settings: FrodoSettings;
    readonly #body = column('frodo-provider-meters');
    readonly #disposables = new Disposables();

    constructor(provider: AiProvider, sources: UsageSources) {
        this.#provider = provider;
        this.#settings = sources.settings;
        this.#usage = providerUsage(provider, sources);
        this.actor.add_child(heading(provider, 'Limites de uso'));
        this.actor.add_child(this.#body);
        const render = (): void => {
            if (this.actor.mapped) this.#render();
        };
        this.#disposables.add(this.#usage.onChanged(render));
        this.#disposables.add(sources.settings.onChanged('claude-show-remaining', render));
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#usage.refresh();
                    this.#render();
                },
                () => undefined,
            ),
        );
    }

    #render(): void {
        this.#body.destroy_all_children();
        const meters = this.#usage.meters(Date.now());
        if (meters.length === 0) this.#body.add_child(emptyState(this.#usage.empty()));
        for (const meter of meters) this.#body.add_child(meterView(meter, this.#provider, this.#settings.claudeShowRemaining, false));
        if (this.#provider === 'gemini' && meters.length > 0) this.#body.add_child(note(ESTIMATED));
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}

export class OverviewCard implements Component {
    readonly actor = card('frodo-overview');
    readonly #provider: AiProvider;
    readonly #usage: ProviderUsage;
    readonly #settings: FrodoSettings;
    readonly #sessions: ClaudeSessions;
    readonly #plan = chip('', 'neutral');
    readonly #meters = column('frodo-provider-meters');
    readonly #status = label('', 'frodo-overview-status');
    readonly #disposables = new Disposables();

    constructor(provider: AiProvider, sources: UsageSources, sessions: ClaudeSessions, open: () => void) {
        this.#provider = provider;
        this.#settings = sources.settings;
        this.#sessions = sessions;
        this.#usage = providerUsage(provider, sources);
        this.actor.x_expand = true;

        const top = heading(provider, PROVIDER_NAMES[provider]);
        this.#plan.y_align = Clutter.ActorAlign.CENTER;
        top.add_child(this.#plan);
        this.#meters.y_expand = true;
        this.#status.x_expand = true;
        this.#status.y_align = Clutter.ActorAlign.CENTER;
        const footer = row('frodo-overview-footer');
        footer.add_child(this.#status);
        const details = textButton('Detalhes', open, 'control', frodoIcon('forward'));
        details.accessible_name = `Ver detalhes do ${PROVIDER_NAMES[provider]}`;
        footer.add_child(details);

        this.actor.add_child(top);
        this.actor.add_child(this.#meters);
        this.actor.add_child(footer);

        const render = (): void => {
            if (this.actor.mapped) this.#render();
        };
        this.#disposables.add(this.#usage.onChanged(render));
        this.#disposables.add(sessions.on('changed', render));
        this.#disposables.add(sources.settings.onChanged('claude-show-remaining', render));
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#usage.refresh();
                    this.#render();
                },
                () => undefined,
            ),
        );
    }

    #render(): void {
        const now = Date.now();
        const plan = this.#usage.plan();
        this.#plan.text = plan ?? '';
        this.#plan.visible = plan !== null;

        this.#meters.destroy_all_children();
        const meters = this.#usage.meters(now).slice(0, 2);
        if (meters.length === 0) this.#meters.add_child(note(this.#usage.empty()));
        for (const meter of meters) this.#meters.add_child(meterView(meter, this.#provider, this.#settings.claudeShowRemaining, true));
        if (this.#provider === 'gemini' && meters.length > 0) this.#meters.add_child(note(ESTIMATED));

        const counts = countByStatus(
            this.#sessions.sessions.filter(state => state.provider === this.#provider),
            now,
        );
        const parts: string[] = [];
        if (counts.working > 0) parts.push(`${counts.working} trabalhando`);
        if (counts.waiting > 0) parts.push(`${counts.waiting} aguardando você`);
        this.#status.text = parts.length > 0 ? parts.join(' · ') : 'Nenhuma sessão ativa';
        for (const state of ['waiting', 'working'] as const) this.#status.remove_style_class_name(`frodo-status-${state}`);
        if (counts.waiting > 0) this.#status.add_style_class_name('frodo-status-waiting');
        else if (counts.working > 0) this.#status.add_style_class_name('frodo-status-working');
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
