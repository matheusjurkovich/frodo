import type St from 'gi://St';
import {Disposables} from '../../shared/disposables.js';
import {column} from '../../shared/ui/layout.js';
import {PositionPicker} from './position-picker.js';
import {Bindings, group, line} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import {MONITORS, SURFACES} from './screen-section.const.js';
import type {ScreenSectionDependencies} from './screen-section.types.js';

export class ScreenSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #disposables = new Disposables();

    constructor({settings}: ScreenSectionDependencies) {
        const bindings = new Bindings(this.#disposables, settings);
        this.actor.add_child(group('Posição', [this.#disposables.own(new PositionPicker(settings)).actor]));
        this.actor.add_child(this.#screen(bindings));
    }

    #screen(bindings: Bindings): St.BoxLayout {
        return group('Tela', [
            line('Monitores', 'Em Ambos, cada tela tem a sua ilha', bindings.choice(MONITORS, 'monitors')),
            line(
                'Fundo',
                'Fosco desfoca o que está atrás. Use Sólido se a abertura ficar pesada.',
                bindings.choice(SURFACES, 'surfaceStyle'),
            ),
            bindings.toggleLine('Ocultar barra superior', 'Relógio, bandeja e indicadores passam a viver na ilha', 'hideTopBar'),
        ]);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
