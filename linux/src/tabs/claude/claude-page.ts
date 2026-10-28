import Clutter from 'gi://Clutter';

import type {ClaudeService} from '../../features/claude/claude-service.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../../features/claude/claude-transcripts-service.js';
import type {CodexUsage} from '../../features/codex/codex-service.js';
import type {GeminiUsage} from '../../features/gemini/gemini-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {AI_PROVIDERS, PROVIDER_NAMES} from '../../shared/ai-provider.js';
import type {AiProvider} from '../../shared/ai-provider.js';
import {Disposables} from '../../shared/disposables.js';
import {column, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {ConsumptionCard} from './consumption-card.js';
import {LimitsCard} from './limits-card.js';
import type {ClaudeTabActions} from './limits-card.js';
import {MetersCard, OverviewCard} from './provider-cards.js';
import {SessionsCard} from './sessions-card.js';

type View = AiProvider | 'all';

export interface ClaudePageDependencies {
    readonly claude: ClaudeService;
    readonly transcripts: ClaudeTranscripts;
    readonly sessions: ClaudeSessions;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly settings: FrodoSettings;
    readonly actions: ClaudeTabActions;
}

export class ClaudePage implements Component {
    readonly actor = column('frodo-section frodo-ai');
    readonly #settings: FrodoSettings;
    readonly #selector = row('frodo-ai-selector');
    readonly #overview = row('frodo-ai-overview');
    readonly #overviewCards = new Map<AiProvider, OverviewCard>();
    readonly #all = column('frodo-section');
    readonly #single = row('frodo-cols');
    readonly #left = column('frodo-section');
    readonly #right = column('frodo-section frodo-claude-side');
    readonly #details = new Map<AiProvider, readonly Component[]>();
    readonly #sessions: SessionsCard;
    readonly #disposables = new Disposables();
    #segmented: Segmented<View> | null = null;
    #view: View = 'all';

    constructor({claude, transcripts, sessions, codex, gemini, settings, actions}: ClaudePageDependencies) {
        this.#settings = settings;
        const sources = {settings, claude, codex, gemini};
        this.#sessions = new SessionsCard(sessions, transcripts, actions.close);

        for (const provider of AI_PROVIDERS) {
            const overview = new OverviewCard(provider, sources, sessions, () => {
                this.#show(provider);
            });
            this.#overviewCards.set(provider, overview);
            this.#overview.add_child(overview.actor);
        }
        this.#overview.layout_manager.homogeneous = true;
        this.#all.add_child(this.#overview);

        this.#details.set('claude', [new LimitsCard(claude, settings, actions), new ConsumptionCard(transcripts, 'claude')]);
        this.#details.set('codex', [new MetersCard('codex', sources), new ConsumptionCard(codex, 'codex')]);
        this.#details.set('gemini', [new MetersCard('gemini', sources), new ConsumptionCard(gemini, 'gemini')]);
        for (const cards of this.#details.values()) for (const detail of cards) this.#left.add_child(detail.actor);

        this.#right.x_expand = false;
        for (const side of [this.#left, this.#right]) {
            side.y_align = Clutter.ActorAlign.START;
            this.#single.add_child(side);
        }

        this.actor.add_child(this.#selector);
        this.actor.add_child(this.#all);
        this.actor.add_child(this.#single);

        this.#disposables.add(
            settings.onChanged('disabled-ai', () => {
                this.#rebuildSelector();
            }),
        );
        this.#rebuildSelector();
    }

    #rebuildSelector(): void {
        const enabled = this.#settings.enabledProviders;
        this.#segmented?.destroy();
        this.#selector.destroy_all_children();
        const options: {id: View; label: string}[] = [{id: 'all', label: 'Todos'}];
        for (const provider of enabled) options.push({id: provider, label: PROVIDER_NAMES[provider]});
        const view: View = this.#view === 'all' || enabled.includes(this.#view) ? this.#view : 'all';
        this.#segmented = new Segmented(options, view, 'frodo-ai-providers');
        this.#segmented.on('changed', next => {
            this.#show(next);
        });
        this.#selector.add_child(this.#segmented.actor);
        this.#selector.visible = enabled.length > 1;
        for (const [provider, overview] of this.#overviewCards) overview.actor.visible = enabled.includes(provider);
        this.#show(enabled.length === 1 && enabled[0] ? enabled[0] : view);
    }

    #show(view: View): void {
        this.#view = view;
        if (this.#segmented) this.#segmented.selected = view;
        const all = view === 'all';
        this.#all.visible = all;
        this.#single.visible = !all;
        for (const [provider, cards] of this.#details) for (const detail of cards) detail.actor.visible = provider === view;
        const target = all ? this.#all : this.#right;
        const actor = this.#sessions.actor;
        if (actor.get_parent() !== target) {
            actor.get_parent()?.remove_child(actor);
            target.add_child(actor);
        }
        this.#sessions.showProvider(all ? null : view);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#segmented?.destroy();
        for (const overview of this.#overviewCards.values()) overview.destroy();
        for (const cards of this.#details.values()) for (const detail of cards) detail.destroy();
        this.#sessions.destroy();
        this.actor.destroy();
    }
}
