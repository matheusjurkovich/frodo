import Clutter from 'gi://Clutter';
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
import type {Level, Spend, UsageWindow} from '../../features/claude/claude-usage.js';
import type {ClaudeService, ProfileUsage} from '../../features/claude/claude-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {chip, iconButton} from '../../shared/ui/buttons.js';
import {card, cardHeading} from '../../shared/ui/card.js';
import {column, dimLabel, label, row, spacer} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {SegmentBar, levelClass} from '../../shared/ui/segment-bar.js';
import {frodoIcon} from '../../shared/ui/icons.js';

const USAGE_PAGE = 'https://claude.ai/settings/usage';
const TICK_SECONDS = 30;

export interface ClaudeTabActions {
    readonly openPreferences: () => void;
    readonly close: () => void;
}

function percentText(value: number): string {
    return `${Math.round(value)}%`;
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

interface MeterOptions {
    readonly name: string;
    readonly percent: number | null;
    readonly level: Level;
    readonly details: readonly string[];
    readonly pace?: number | null;
}

function meter({name, percent, level, details, pace = null}: MeterOptions): St.BoxLayout {
    const root = column('frodo-meter');
    const top = row('frodo-meter-top');
    top.add_child(label(name, 'frodo-meter-name'));
    top.add_child(spacer());
    if (percent !== null) top.add_child(label(percentText(percent), 'frodo-meter-value frodo-mono'));
    root.add_child(top);
    if (percent !== null) {
        const bar = new SegmentBar();
        bar.segments = [{fraction: percent / 100, styleClass: `frodo-fill-claude ${levelClass(level)}`}];
        bar.marker = pace === null ? null : pace / 100;
        root.add_child(bar.actor);
    }
    const visibleDetails = details.filter(detail => detail !== '');
    if (visibleDetails.length > 0) root.add_child(label(visibleDetails.join(' · '), 'frodo-meter-note'));
    return root;
}

export class LimitsCard implements Component {
    readonly actor = card('frodo-limits');
    readonly #service: ClaudeService;
    readonly #settings: FrodoSettings;
    readonly #actions: ClaudeTabActions;
    readonly #profiles = column('frodo-claude-profiles');
    readonly #updated = label('', 'frodo-dim frodo-limits-updated');
    readonly #refresh: St.Button;
    readonly #tick = new Timer();
    readonly #disposables = new Disposables();

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
            service.on('changed', () => {
                this.#render();
            }),
        );
        this.#disposables.add(
            settings.onChanged('claude-show-remaining', () => {
                this.#render();
            }),
        );
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#tick.every(TICK_SECONDS, () => {
                        this.#render();
                    });
                },
                () => {
                    this.#tick.stop();
                },
            ),
        );
        this.#render();
    }

    #header(): St.BoxLayout {
        const title = cardHeading('Limites de uso');
        title.x_expand = true;
        const header = row('frodo-limits-header');
        header.add_child(
            new St.Bin({
                style_class: 'frodo-claude-badge',
                child: new St.Icon({gicon: frodoIcon('claude'), style_class: 'frodo-claude-badge-icon'}),
                y_align: Clutter.ActorAlign.CENTER,
            }),
        );
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
                    this.#actions.openPreferences();
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
        header.add_child(new St.Icon({gicon: frodoIcon('claude'), style_class: 'frodo-claude-logo'}));
        header.add_child(label(usage.profile.label, 'frodo-claude-name'));
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
        return meter({
            name: `${window.label}${remaining ? ' · restante' : ''}`,
            percent: shownPercent(window.utilization, remaining),
            level: displayLevel(window, now),
            details: [capitalize(relativeReset(window.resetsAt, now)), projectionNote(window, remaining, now)],
            pace: shownPace(pacePercent(window.resetsAt, window.totalSeconds, now), remaining),
        });
    }

    #spendMeter(spend: Spend, remaining: boolean): St.BoxLayout {
        const amounts = [spend.used, spend.limit].filter((value): value is string => value !== null).join(' / ');
        return meter({
            name: 'Uso extra',
            percent: spend.percent === null ? null : shownPercent(spend.percent, remaining),
            level: spend.level,
            details: [amounts],
        });
    }

    destroy(): void {
        this.#tick.stop();
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
