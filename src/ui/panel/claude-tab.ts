import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {profileChip} from '../../core/claude-profiles.js';
import {effectiveLevel, pacePercent, projectionNote, relativeReset, shownPace, shownPercent, tierIcon} from '../../core/claude-usage.js';
import type {Spend, UsageWindow} from '../../core/claude-usage.js';
import type {ClaudeService, ProfileUsage} from '../../services/claude-service.js';
import type {FrodoSettings} from '../../services/settings.js';
import {Disposables} from '../../util/disposables.js';
import {Timer} from '../../util/timer.js';
import {frodoIcon} from '../icons.js';
import type {FrodoIconName} from '../icons.js';
import {ProgressBar, dimLabel, levelColor} from '../widgets.js';
import type {Rgb} from '../widgets.js';

const USAGE_PAGE = 'https://claude.ai/settings/usage';
const TICK_SECONDS = 30;

export interface ClaudeTabActions {
    readonly openPreferences: () => void;
    readonly close: () => void;
}

function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

function label(text: string, styleClass: string): St.Label {
    return new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
}

function percentText(value: number): string {
    return `${Math.round(value)}%`;
}

interface MeterOptions {
    readonly name: string;
    readonly percent: number | null;
    readonly color: Rgb;
    readonly details: readonly string[];
    readonly pace?: number | null;
}

function meter({name, percent, color, details, pace = null}: MeterOptions): St.BoxLayout {
    const root = column('frodo-meter');
    const top = new St.BoxLayout({x_expand: true});
    top.add_child(label(name, 'frodo-meter-name'));
    top.add_child(new St.Widget({x_expand: true}));
    if (percent !== null) top.add_child(label(percentText(percent), 'frodo-meter-value'));
    root.add_child(top);
    if (percent !== null) {
        const bar = new ProgressBar(color);
        bar.fraction = percent / 100;
        bar.pace = pace === null ? null : pace / 100;
        root.add_child(bar.actor);
    }
    const visibleDetails = details.filter(detail => detail !== '');
    if (visibleDetails.length > 0) root.add_child(label(visibleDetails.join(' · '), 'frodo-meter-note'));
    return root;
}

export class ClaudeTab {
    readonly actor = column('frodo-claude-tab');
    readonly #service: ClaudeService;
    readonly #settings: FrodoSettings;
    readonly #actions: ClaudeTabActions;
    readonly #profiles = column('frodo-claude-profiles');
    readonly #updated = dimLabel();
    readonly #refreshLabel = label('Atualizar', 'frodo-button-label');
    readonly #tick = new Timer();
    readonly #disposables = new Disposables();

    constructor(service: ClaudeService, settings: FrodoSettings, actions: ClaudeTabActions) {
        this.#service = service;
        this.#settings = settings;
        this.#actions = actions;
        this.actor.add_child(this.#profiles);
        this.actor.add_child(this.#footer());
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
        this.#disposables.signal(
            this.actor,
            this.actor.connect('notify::mapped', () => {
                this.#syncTick();
            }),
        );
        this.#render();
    }

    #syncTick(): void {
        if (this.actor.mapped)
            this.#tick.every(TICK_SECONDS, () => {
                this.#render();
            });
        else this.#tick.stop();
    }

    #footer(): St.BoxLayout {
        const footer = column('frodo-claude-footer');
        const buttons = new St.BoxLayout({style_class: 'frodo-claude-buttons', x_expand: true});
        buttons.add_child(
            this.#button('external', 'Página de uso', () => {
                this.#actions.close();
                Gio.AppInfo.launch_default_for_uri(USAGE_PAGE, null);
            }),
        );
        buttons.add_child(
            this.#button('refresh', this.#refreshLabel, () => {
                void this.#service.refresh(true);
            }),
        );
        buttons.add_child(
            this.#button('gear', 'Configurações', () => {
                this.#actions.openPreferences();
            }),
        );
        footer.add_child(buttons);
        footer.add_child(this.#updated);
        return footer;
    }

    #button(icon: FrodoIconName, text: string | St.Label, onClick: () => void): St.Button {
        const content = new St.BoxLayout({style_class: 'frodo-tab-content', x_align: Clutter.ActorAlign.CENTER});
        const caption = typeof text === 'string' ? label(text, 'frodo-button-label') : text;
        content.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-tab-icon'}));
        content.add_child(caption);
        const button = new St.Button({
            style_class: 'frodo-claude-button',
            child: content,
            x_expand: true,
            can_focus: true,
            accessible_name: caption.text,
        });
        button.connect('clicked', onClick);
        return button;
    }

    #render(): void {
        this.#profiles.destroy_all_children();
        const profiles = this.#service.profiles;
        const now = Date.now();
        for (const usage of profiles) this.#profiles.add_child(this.#profileBlock(usage, profiles.length > 1, now));
        if (profiles.length === 0) this.#profiles.add_child(dimLabel('Procurando perfis do Claude Code…'));

        this.#refreshLabel.text = profiles.length > 1 ? 'Atualizar todos' : 'Atualizar';
        const last = this.#service.lastRefresh;
        if (this.#service.lastFailed) this.#updated.text = 'Falha ao atualizar';
        else if (last > 0)
            this.#updated.text = `Atualizado às ${GLib.DateTime.new_from_unix_local(Math.floor(last / 1000)).format('%H:%M') ?? ''}`;
        else this.#updated.text = 'Carregando…';
    }

    #profileBlock(usage: ProfileUsage, multiple: boolean, now: number): St.BoxLayout {
        const block = column('frodo-claude-profile');
        const header = new St.BoxLayout({style_class: 'frodo-claude-header', x_expand: true});
        header.add_child(new St.Icon({gicon: frodoIcon('claude'), style_class: 'frodo-claude-logo'}));
        header.add_child(label(usage.profile.label, 'frodo-claude-name'));
        if (multiple) header.add_child(label(profileChip(usage.profile.label), 'frodo-chip'));
        if (multiple && usage.active) header.add_child(label('ativo', 'frodo-chip frodo-chip-active'));
        header.add_child(new St.Widget({x_expand: true}));
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
            color: levelColor(effectiveLevel(window, now)),
            details: [relativeReset(window.resetsAt, now), projectionNote(window, remaining, now)],
            pace: shownPace(pacePercent(window.resetsAt, window.totalSeconds, now), remaining),
        });
    }

    #spendMeter(spend: Spend, remaining: boolean): St.BoxLayout {
        const amounts = [spend.used, spend.limit].filter((value): value is string => value !== null).join(' / ');
        return meter({
            name: 'Uso extra',
            percent: spend.percent === null ? null : shownPercent(spend.percent, remaining),
            color: levelColor(spend.level),
            details: [amounts],
        });
    }

    destroy(): void {
        this.#tick.stop();
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
