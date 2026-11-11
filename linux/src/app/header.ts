import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';
import type {Recording} from '../features/system/recording-service.js';
import {Disposables} from '../shared/disposables.js';
import {formatDate} from '../shared/format.js';
import {iconButton, textButton} from '../shared/ui/buttons.js';
import {label, row} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {frodoIcon} from '../shared/ui/icons.js';
import type {TabBar} from './tab-bar.js';
import {INTERFACE_SCHEMA, SHOW_SECONDS_KEY} from '../shared/desktop-interface.const.js';
import type {HeaderActions} from './header.types.js';

export class Header implements Component {
    readonly actor = row('frodo-header');
    readonly #gear: St.Button;
    readonly #wallClock = new GnomeDesktop.WallClock();
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();

    constructor(tabBar: TabBar, actions: HeaderActions, recording: Pick<Recording, 'startedAt' | 'on' | 'stop'>) {
        const clock = label('', 'frodo-header-clock');
        const date = label('', 'frodo-header-date');
        const time = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'frodo-header-time',
            y_align: Clutter.ActorAlign.CENTER,
        });
        time.add_child(clock);
        time.add_child(date);

        this.#gear = iconButton(frodoIcon('gear'), 'Configurações da ilha', actions.openSettings, 'ghost');
        const stop = textButton(
            'Parar gravação',
            () => {
                recording.stop();
            },
            'danger',
            frodoIcon('stop'),
        );
        const syncRecording = (): void => {
            stop.visible = recording.startedAt !== null;
        };
        this.#disposables.add(recording.on('changed', syncRecording));
        syncRecording();
        this.actor.add_child(time);
        this.actor.add_child(tabBar.actor);
        this.actor.add_child(stop);
        this.actor.add_child(this.#gear);
        const power = iconButton(
            frodoIcon('power'),
            'Opções de energia',
            () => {
                actions.openPower(power);
            },
            'ghost',
        );
        power.add_style_class_name('frodo-header-power');
        this.actor.add_child(power);
        this.actor.add_child(iconButton(frodoIcon('collapse'), 'Recolher ilha', actions.collapse, 'ghost'));

        const sync = (): void => {
            const format = this.#interface.get_boolean(SHOW_SECONDS_KEY) ? '%H:%M:%S' : '%H:%M';
            clock.text = GLib.DateTime.new_now_local().format(format) ?? '';
            date.text = formatDate(new Date());
        };
        this.#disposables.signal(this.#wallClock, this.#wallClock.connect('notify::clock', sync));
        this.#disposables.signal(this.#interface, this.#interface.connect(`changed::${SHOW_SECONDS_KEY}`, sync));
        sync();
    }

    setSettingsActive(active: boolean): void {
        this.#gear.checked = active;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
