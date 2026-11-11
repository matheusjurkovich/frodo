import Clutter from 'gi://Clutter';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {AI_PROVIDERS, PROVIDER_NAMES} from '../../shared/ai-provider.const.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {Disposables} from '../../shared/disposables.js';
import {column, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {swap} from '../../shared/ui/motion.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {ConsumptionCard} from './consumption-card.js';
import {LimitsCard} from './limits-card.js';
import {MetersCard} from './meters-card.js';
import {OverviewCard} from './overview-card.js';
import {SessionsCard} from './sessions-card.js';
import {VIEWS} from './claude-page.const.js';
import type {View, ClaudePageDependencies} from './claude-page.types.js';

export class ClaudePage implements Component {
    readonly actor = column('frodo-section frodo-ai');
    readonly #settings: FrodoSettings;
    readonly #selector = row('frodo-ai-selector');
    readonly #overview = row('frodo-ai-overview');
    readonly #overviewCards = new Map<AiProvider, OverviewCard>();
    readonly #views = column('');
    readonly #all = column('frodo-section');
    readonly #single = row('frodo-cols');
    readonly #left = column('frodo-section');
    readonly #right = column('frodo-section frodo-claude-side');
    readonly #details = new Map<AiProvider, readonly Component[]>();
    readonly #sessionsAll: SessionsCard;
    readonly #sessionsSingle: SessionsCard;
    readonly #disposables = new Disposables();
    #segmented: Segmented<View> | null = null;
    #view: View = 'all';

    constructor({claude, transcripts, sessions, codex, gemini, settings, actions}: ClaudePageDependencies) {
        this.#settings = settings;
        const sources = {settings, claude, codex, gemini};
        this.#sessionsAll = new SessionsCard(sessions, transcripts, actions.close);
        this.#sessionsSingle = new SessionsCard(sessions, transcripts, actions.close);

        for (const provider of AI_PROVIDERS) {
            const overview = new OverviewCard(provider, sources, sessions, () => {
                this.#show(provider);
            });
            this.#overviewCards.set(provider, overview);
            this.#overview.add_child(overview.actor);
        }
        this.#overview.layout_manager.homogeneous = true;
        this.#all.add_child(this.#overview);
        this.#all.add_child(this.#sessionsAll.actor);

        this.#details.set('claude', [new LimitsCard(claude, settings, actions), new ConsumptionCard(transcripts, 'claude')]);
        this.#details.set('codex', [new MetersCard('codex', sources), new ConsumptionCard(codex, 'codex')]);
        this.#details.set('gemini', [new MetersCard('gemini', sources), new ConsumptionCard(gemini, 'gemini')]);
        for (const cards of this.#details.values()) for (const detail of cards) this.#left.add_child(detail.actor);

        this.#right.x_expand = false;
        this.#right.add_child(this.#sessionsSingle.actor);
        for (const side of [this.#left, this.#right]) {
            side.y_align = Clutter.ActorAlign.START;
            this.#single.add_child(side);
        }

        this.#views.add_child(this.#all);
        this.#views.add_child(this.#single);
        this.actor.add_child(this.#selector);
        this.actor.add_child(this.#views);

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
        const direction = VIEWS.indexOf(view) > VIEWS.indexOf(this.#view) ? 1 : -1;
        const changed = view !== this.#view;
        this.#view = view;
        if (this.#segmented) this.#segmented.selected = view;
        if (changed)
            swap(this.#views, direction, () => {
                this.#apply(view);
            });
        else this.#apply(view);
    }

    #apply(view: View): void {
        const all = view === 'all';
        if (!all) this.#sessionsSingle.showProvider(view);
        for (const [provider, cards] of this.#details) for (const detail of cards) detail.actor.visible = provider === view;
        if (all) {
            this.#all.visible = true;
            this.#single.visible = false;
        } else {
            this.#single.visible = true;
            this.#all.visible = false;
        }
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#segmented?.destroy();
        for (const overview of this.#overviewCards.values()) overview.destroy();
        for (const cards of this.#details.values()) for (const detail of cards) detail.destroy();
        this.#sessionsAll.destroy();
        this.#sessionsSingle.destroy();
        this.actor.destroy();
    }
}
