import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {formatDate} from '../../core/format.js';
import {formatGb} from '../../core/memory.js';
import type {SystemState} from '../../services/system-state.js';
import type {Unsubscribe} from '../../util/emitter.js';
import {iconButton} from '../components/buttons.js';
import {cardTitle} from '../components/card.js';
import {column, dimLabel, row, spacer} from '../components/layout.js';
import {SegmentBar} from '../components/segment-bar.js';
import {frodoIcon} from '../icons.js';

function unsubscribeOnDestroy(actor: Clutter.Actor, unsubscribes: readonly Unsubscribe[]): void {
    actor.connect('destroy', () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
    });
}

export interface HeaderActions {
    readonly openPreferences: () => void;
    readonly openOverview: () => void;
}

export function headerSection({openPreferences, openOverview}: HeaderActions): St.BoxLayout {
    const box = row('frodo-header');
    const clock = new St.Label({style_class: 'frodo-big-clock', y_align: Clutter.ActorAlign.CENTER});
    const date = dimLabel();
    box.add_child(clock);
    box.add_child(date);
    box.add_child(spacer());
    box.add_child(iconButton(frodoIcon('overview'), 'Visão geral', openOverview));
    box.add_child(iconButton(frodoIcon('gear'), 'Configurações do Frodo', openPreferences));

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

interface Stat {
    readonly actor: St.BoxLayout;
    readonly label: St.Label;
    readonly bar: SegmentBar;
}

function stat(): Stat {
    const actor = row('frodo-stat');
    const label = new St.Label({style_class: 'frodo-stat-label', y_align: Clutter.ActorAlign.CENTER});
    const bar = new SegmentBar();
    actor.add_child(label);
    actor.add_child(bar.actor);
    return {actor, label, bar};
}

export function systemSection(state: SystemState): St.BoxLayout {
    const section = column('frodo-section');
    const ram = stat();
    const battery = stat();
    section.add_child(cardTitle('SISTEMA'));
    section.add_child(ram.actor);
    section.add_child(battery.actor);

    const sync = (): void => {
        const {memory, battery: info} = state;
        ram.label.text = memory ? `RAM ${formatGb(memory.usedKb)}` : 'RAM —';
        ram.bar.actor.visible = memory !== null;
        ram.bar.segments = [{fraction: memory ? memory.usedKb / memory.totalKb : 0, styleClass: 'frodo-fill-ram'}];
        battery.actor.visible = info !== null;
        if (info) {
            battery.label.text = `Bat ${info.percent}%${info.charging ? ' ⚡' : ''}`;
            battery.bar.segments = [{fraction: info.percent / 100, styleClass: 'frodo-fill-battery'}];
        }
    };
    unsubscribeOnDestroy(section, [state.on('memory', sync), state.on('battery', sync)]);
    sync();
    return section;
}
