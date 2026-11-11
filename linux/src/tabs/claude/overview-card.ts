import Clutter from 'gi://Clutter';
import {countByStatus} from '../../features/claude/claude-sessions.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {PROVIDER_NAMES} from '../../shared/ai-provider.const.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {Disposables} from '../../shared/disposables.js';
import {chip, textButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {VISIBLE_METERS} from './overview-card.const.js';
import {providerHeading} from './provider-heading.js';
import {ProviderMeters} from './provider-meters.js';
import {providerUsage} from './provider-usage.js';
import type {ProviderUsage, UsageSources} from './provider-usage.types.js';
import {renderWhileMapped} from './render-while-mapped.js';

export class OverviewCard implements Component {
    readonly actor = card('frodo-overview');
    readonly #provider: AiProvider;
    readonly #usage: ProviderUsage;
    readonly #settings: FrodoSettings;
    readonly #sessions: ClaudeSessions;
    readonly #plan = chip('', 'neutral');
    readonly #meters: ProviderMeters;
    readonly #status = label('', 'frodo-overview-status');
    readonly #disposables = new Disposables();

    constructor(provider: AiProvider, sources: UsageSources, sessions: ClaudeSessions, open: () => void) {
        this.#provider = provider;
        this.#settings = sources.settings;
        this.#sessions = sessions;
        this.#usage = providerUsage(provider, sources);
        this.#meters = this.#disposables.own(new ProviderMeters(provider, wrappedLabel('', 'frodo-meter-note')));
        this.actor.x_expand = true;

        const top = providerHeading(provider, PROVIDER_NAMES[provider]);
        this.#plan.y_align = Clutter.ActorAlign.CENTER;
        top.add_child(this.#plan);
        this.#meters.actor.y_expand = true;
        this.#status.x_expand = true;
        this.#status.y_align = Clutter.ActorAlign.CENTER;
        const footer = row('frodo-overview-footer');
        footer.add_child(this.#status);
        const details = textButton('Detalhes', open, 'control', frodoIcon('forward'));
        details.accessible_name = `Ver detalhes do ${PROVIDER_NAMES[provider]}`;
        footer.add_child(details);

        this.actor.add_child(top);
        this.actor.add_child(this.#meters.actor);
        this.actor.add_child(footer);

        this.#disposables.add(
            renderWhileMapped(
                this.actor,
                [
                    this.#usage.onChanged,
                    callback => sessions.on('changed', callback),
                    callback => sources.settings.onChanged('claude-show-remaining', callback),
                ],
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
        const now = Date.now();
        const plan = this.#usage.plan();
        this.#plan.text = plan ?? '';
        this.#plan.visible = plan !== null;
        this.#meters.show(this.#usage.meters(now).slice(0, VISIBLE_METERS), this.#usage.empty(), this.#settings.claudeShowRemaining, true);

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
