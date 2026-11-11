import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {Disposables} from '../../shared/disposables.js';
import {card, emptyState} from '../../shared/ui/card.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {providerHeading} from './provider-heading.js';
import {ProviderMeters} from './provider-meters.js';
import {providerUsage} from './provider-usage.js';
import type {ProviderUsage, UsageSources} from './provider-usage.types.js';
import {renderWhileMapped} from './render-while-mapped.js';

export class MetersCard implements Component {
    readonly actor = card('frodo-limits');
    readonly #usage: ProviderUsage;
    readonly #settings: FrodoSettings;
    readonly #meters: ProviderMeters;
    readonly #disposables = new Disposables();

    constructor(provider: AiProvider, sources: UsageSources) {
        this.#settings = sources.settings;
        this.#usage = providerUsage(provider, sources);
        this.#meters = this.#disposables.own(new ProviderMeters(provider, emptyState('')));
        this.actor.add_child(providerHeading(provider, 'Limites de uso'));
        this.actor.add_child(this.#meters.actor);
        this.#disposables.add(
            renderWhileMapped(
                this.actor,
                [this.#usage.onChanged, callback => sources.settings.onChanged('claude-show-remaining', callback)],
                () => {
                    this.#render();
                },
                {
                    start: () => {
                        this.#usage.refresh();
                    },
                },
            ),
        );
    }

    #render(): void {
        this.#meters.show(this.#usage.meters(Date.now()), this.#usage.empty(), this.#settings.claudeShowRemaining, false);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
