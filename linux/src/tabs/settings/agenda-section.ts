import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Disposables} from '../../shared/disposables.js';
import {spawn} from '../../shared/shell-internals.js';
import {textButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column} from '../../shared/ui/layout.js';
import {Bindings, group, line} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import {NOTICES} from './agenda-section.const.js';
import type {AgendaSectionDependencies} from './agenda-section.types.js';

export class AgendaSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #disposables = new Disposables();
    readonly #bindings = new Bindings(this.#disposables);

    constructor(deps: AgendaSectionDependencies) {
        const settings = deps.settings;
        const google = line(
            'Google Agenda',
            'Pelas Contas Online do GNOME',
            textButton('Abrir Contas Online', () => {
                deps.close();
                spawn(['gnome-control-center', 'online-accounts']);
            }),
        );
        const icon = new St.Icon({gicon: frodoIcon('google'), icon_size: 18, x_expand: true, y_expand: true});
        icon.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        google.insert_child_at_index(new St.Bin({style_class: 'frodo-integration-icon frodo-integration-google', child: icon}), 0);
        this.actor.add_child(
            group('Google Agenda', [
                google,
                line(
                    'Avisar na pílula antes da reunião',
                    'Mostra o título e o botão Entrar',
                    this.#bindings.segmented(
                        NOTICES,
                        () => String(settings.meetingNoticeMinutes),
                        value => {
                            settings.meetingNoticeMinutes = Number(value);
                        },
                    ),
                ),
            ]),
        );
    }

    sync(): void {
        this.#bindings.sync();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
