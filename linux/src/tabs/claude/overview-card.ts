import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {PROVIDER_NAMES} from '../../shared/ai-provider.const.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {Disposables} from '../../shared/disposables.js';
import {shownMeterPercent} from '../../shared/meter.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {providerTile} from '../../shared/ui/provider-tile.js';
import {VISIBLE_METERS} from './overview-card.const.js';
import {providerUsage} from './provider-usage.js';
import type {ProviderUsage, UsageSources} from './provider-usage.types.js';
import {renderWhileMapped} from './render-while-mapped.js';

export class OverviewCard implements Component {
    readonly actor: St.Button;
    readonly #usage: ProviderUsage;
    readonly #settings: FrodoSettings;
    readonly #summary = label('', 'frodo-dim frodo-overview-summary');
    readonly #disposables = new Disposables();

    constructor(provider: AiProvider, sources: UsageSources, open: () => void) {
        this.#settings = sources.settings;
        this.#usage = providerUsage(provider, sources);

        const content = row('frodo-overview-content');
        const tile = providerTile(provider, 28);
        tile.y_align = Clutter.ActorAlign.CENTER;
        const text = row('frodo-overview-text');
        text.x_expand = true;
        text.y_align = Clutter.ActorAlign.CENTER;
        const name = label(PROVIDER_NAMES[provider], 'frodo-overview-name');
        this.#summary.x_expand = true;
        this.#summary.y_align = Clutter.ActorAlign.CENTER;
        this.#summary.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        text.add_child(name);
        text.add_child(this.#summary);
        const chevron = new St.Icon({
            gicon: frodoIcon('forward'),
            style_class: 'frodo-overview-chevron',
            y_align: Clutter.ActorAlign.CENTER,
        });
        for (const child of [tile, text, chevron]) content.add_child(child);
        this.actor = contentButton('frodo-overview', content, open, {
            x_expand: true,
            accessible_name: `Ver detalhes do ${PROVIDER_NAMES[provider]}`,
        });

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
        const meters = this.#usage.meters(Date.now()).slice(0, VISIBLE_METERS);
        const remaining = this.#settings.claudeShowRemaining;
        this.#summary.text =
            meters.length === 0
                ? this.#usage.empty()
                : meters.map(meter => `${meter.short} ${String(Math.round(shownMeterPercent(meter.percent, remaining)))}%`).join(' · ');
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
