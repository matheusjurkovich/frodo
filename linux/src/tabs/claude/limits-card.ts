import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {profileChip} from '../../features/claude/claude-profiles.js';
import {
    displayLevel,
    pacePercent,
    projectionNote,
    relativeReset,
    shownPace,
    shownPercent,
    tierIcon,
} from '../../features/claude/claude-usage.js';
import type {Spend, UsageWindow} from '../../features/claude/claude-usage.types.js';
import type {ClaudeService} from '../../features/claude/claude-service.js';
import type {ProfileUsage} from '../../features/claude/claude-service.types.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {capitalize} from '../../shared/format.js';
import {Timer} from '../../shared/timer.js';
import {chip, iconButton} from '../../shared/ui/buttons.js';
import {card, cardHeading} from '../../shared/ui/card.js';
import {providerTile} from '../../shared/ui/provider-tile.js';
import {column, dimLabel, label, row, spacer} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {levelClass} from '../../shared/level.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {TICK_SECONDS, USAGE_PAGE} from './limits-card.const.js';
import {MeterRow} from './meter-row.js';
import type {MeterView} from './meter-row.types.js';
import {renderWhileMapped} from './render-while-mapped.js';
import type {ClaudeTabActions} from './limits-card.types.js';

function meter(view: MeterView): St.BoxLayout {
    const result = new MeterRow();
    result.show(view);
    return result.actor;
}

export class LimitsCard implements Component {
    readonly actor = card('frodo-limits');
    readonly #service: ClaudeService;
    readonly #settings: FrodoSettings;
    readonly #actions: ClaudeTabActions;
    readonly #profiles = column('frodo-claude-profiles');
    readonly #updated = label('', 'frodo-dim frodo-limits-updated');
    readonly #refresh: St.Button;
    readonly #disposables = new Disposables();
    readonly #tick = this.#disposables.own(new Timer());

    constructor(service: ClaudeService, settings: FrodoSettings, actions: ClaudeTabActions) {
        this.#service = service;
        this.#settings = settings;
        this.#actions = actions;
        this.#refresh = iconButton(
            frodoIcon('refresh'),
            'Atualizar',
            () => {
                void this.#service.refresh(true);
            },
            'control',
            32,
        );
        this.actor.add_child(this.#header());
        this.actor.add_child(this.#profiles);
        this.#disposables.add(
            renderWhileMapped(
                this.actor,
                [callback => service.on('changed', callback), callback => settings.onChanged('claude-show-remaining', callback)],
                () => {
                    this.#render();
                },
                {
                    start: () => {
                        this.#tick.every(TICK_SECONDS, () => {
                            this.#render();
                        });
                    },
                    stop: () => {
                        this.#tick.stop();
                    },
                },
            ),
        );
    }

    #header(): St.BoxLayout {
        const title = cardHeading('Limites de uso');
        title.x_expand = true;
        const header = row('frodo-limits-header');
        header.add_child(providerTile('claude', 28));
        header.add_child(title);
        header.add_child(this.#updated);
        header.add_child(
            iconButton(
                frodoIcon('external'),
                'Página de uso',
                () => {
                    this.#actions.close();
                    Gio.AppInfo.launch_default_for_uri(USAGE_PAGE, null);
                },
                'control',
                32,
            ),
        );
        header.add_child(this.#refresh);
        header.add_child(
            iconButton(
                frodoIcon('gear'),
                'Configurações',
                () => {
                    this.#actions.openSettings();
                },
                'control',
                32,
            ),
        );
        return header;
    }

    #render(): void {
        this.#profiles.destroy_all_children();
        const profiles = this.#service.profiles;
        const now = Date.now();
        for (const usage of profiles) this.#profiles.add_child(this.#profileBlock(usage, profiles.length > 1, now));
        if (profiles.length === 0) this.#profiles.add_child(dimLabel('Procurando perfis do Claude Code…'));

        this.#refresh.accessible_name = profiles.length > 1 ? 'Atualizar todos' : 'Atualizar';
        const last = this.#service.lastRefresh;
        if (this.#service.lastFailed) this.#updated.text = 'Falha ao atualizar';
        else if (last > 0)
            this.#updated.text = `Atualizado às ${GLib.DateTime.new_from_unix_local(Math.floor(last / 1000)).format('%H:%M') ?? ''}`;
        else this.#updated.text = 'Carregando…';
    }

    #profileBlock(usage: ProfileUsage, multiple: boolean, now: number): St.BoxLayout {
        const block = column('frodo-claude-profile');
        const header = row('frodo-claude-header');
        if (multiple) header.add_child(label(usage.profile.label, 'frodo-claude-name'));
        if (multiple) header.add_child(chip(profileChip(usage.profile.label)));
        if (multiple && usage.active) header.add_child(chip('ativo', 'accent'));
        header.add_child(spacer());
        if (usage.tier) {
            const icon = tierIcon(usage.tier);
            if (icon) header.add_child(new St.Icon({gicon: frodoIcon(`tier-${icon}`), style_class: 'frodo-tier-icon'}));
            header.add_child(label(usage.tier, 'frodo-tier'));
        }
        block.add_child(header);
        if (usage.subtitle) block.add_child(label(usage.subtitle, 'frodo-meter-note'));

        const remaining = this.#settings.claudeShowRemaining;
        for (const window of usage.windows) block.add_child(this.#windowMeter(window, remaining, now));
        if (usage.spend) block.add_child(this.#spendMeter(usage.spend, remaining));
        if (usage.status === 'loading' && usage.windows.length === 0) block.add_child(dimLabel('Carregando…'));
        if (usage.error) block.add_child(label(usage.error, 'frodo-claude-error'));
        return block;
    }

    #windowMeter(window: UsageWindow, remaining: boolean, now: number): St.BoxLayout {
        const pace = shownPace(pacePercent(window.resetsAt, window.totalSeconds, now), remaining);
        return meter({
            name: `${window.label}${remaining ? ' · restante' : ''}`,
            percent: shownPercent(window.utilization, remaining),
            fillClass: `frodo-fill-claude ${levelClass(displayLevel(window, now))}`,
            marker: pace === null ? null : pace / 100,
            note: [capitalize(relativeReset(window.resetsAt, now)), projectionNote(window, remaining, now)]
                .filter(detail => detail !== '')
                .join(' · '),
        });
    }

    #spendMeter(spend: Spend, remaining: boolean): St.BoxLayout {
        return meter({
            name: 'Uso extra',
            percent: spend.percent === null ? null : shownPercent(spend.percent, remaining),
            fillClass: `frodo-fill-claude ${levelClass(spend.level)}`,
            note: [spend.used, spend.limit].filter((value): value is string => value !== null).join(' / '),
        });
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
