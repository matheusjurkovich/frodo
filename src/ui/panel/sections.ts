import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {claudeErrorText} from '../../core/claude.js';
import {formatDate, formatReset} from '../../core/format.js';
import {formatGb} from '../../core/memory.js';
import type {UsageWindow} from '../../core/types.js';
import type {SystemState} from '../../services/system-state.js';
import type {Unsubscribe} from '../../util/emitter.js';
import {COLORS, StatRow, dimLabel, heading, roundButton} from '../widgets.js';

function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

function unsubscribeOnDestroy(actor: Clutter.Actor, unsubscribes: readonly Unsubscribe[]): void {
    actor.connect('destroy', () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
    });
}

export function headerSection(openPreferences: () => void): St.BoxLayout {
    const box = new St.BoxLayout({style_class: 'frodo-header', x_expand: true});
    const clock = new St.Label({style_class: 'frodo-big-clock', y_align: Clutter.ActorAlign.CENTER});
    const date = dimLabel();
    box.add_child(clock);
    box.add_child(date);
    box.add_child(new St.Widget({x_expand: true}));
    box.add_child(roundButton('emblem-system-symbolic', 'Configurações do Frodo', openPreferences));

    const wallClock = new GnomeDesktop.WallClock();
    const sync = (): void => {
        clock.text = GLib.DateTime.new_now_local().format('%H:%M') ?? '';
        date.text = formatDate(new Date());
    };
    const id = wallClock.connect('notify::clock', sync);
    box.connect('destroy', () => {
        wallClock.disconnect(id);
    });
    sync();
    return box;
}

export function systemSection(state: SystemState): St.BoxLayout {
    const section = column('frodo-section');
    const ram = new StatRow('RAM', COLORS.ram);
    const battery = new StatRow('Bat', COLORS.battery);
    section.add_child(heading('SISTEMA'));
    section.add_child(ram.actor);
    section.add_child(battery.actor);

    const sync = (): void => {
        const {memory, battery: info} = state;
        ram.set(memory ? `RAM ${formatGb(memory.usedKb)}` : 'RAM —', memory ? memory.usedKb / memory.totalKb : null);
        battery.actor.visible = info !== null;
        if (info) battery.set(`Bat ${info.percent}%${info.charging ? ' ⚡' : ''}`, info.percent / 100);
    };
    unsubscribeOnDestroy(section, [state.on('memory', sync), state.on('battery', sync)]);
    sync();
    return section;
}

function setUsage(row: StatRow, name: string, window: UsageWindow | null, nowMs: number): void {
    if (window) row.set(`${name} ${Math.round(window.percent)}%`, window.percent / 100, formatReset(window.resetsAt, nowMs));
    else row.set(`${name} —`, null);
}

export function claudeSection(state: SystemState): St.BoxLayout {
    const section = column('frodo-section');
    const session = new StatRow('Sessão', COLORS.claude);
    const weekly = new StatRow('Semana', COLORS.claude);
    const error = new St.Label({style_class: 'frodo-stat-note', visible: false});
    section.add_child(heading('CLAUDE'));
    section.add_child(session.actor);
    section.add_child(weekly.actor);
    section.add_child(error);

    const sync = (): void => {
        const {claude} = state;
        const now = Date.now();
        setUsage(session, 'Sessão', claude.session, now);
        setUsage(weekly, 'Semana', claude.weekly, now);
        error.text = claudeErrorText(claude.error);
        error.visible = error.text !== '';
    };
    unsubscribeOnDestroy(section, [state.on('claude', sync)]);
    sync();
    return section;
}
