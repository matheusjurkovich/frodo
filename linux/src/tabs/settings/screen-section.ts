import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {PillPosition} from '../../settings/schema-values.types.js';
import {Disposables} from '../../shared/disposables.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {Bindings, group, line, strut} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import {POSITION_GRID, MONITORS, SURFACES} from './screen-section.const.js';
import type {ScreenSectionDependencies} from './screen-section.types.js';

export class ScreenSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #settings: FrodoSettings;
    readonly #disposables = new Disposables();
    readonly #bindings = new Bindings(this.#disposables);

    constructor(deps: ScreenSectionDependencies) {
        this.#settings = deps.settings;
        this.actor.add_child(this.#position());
        this.actor.add_child(this.#screen());
    }

    sync(): void {
        this.#bindings.sync();
    }

    #position(): St.BoxLayout {
        const settings = this.#settings;
        const current = label('', 'frodo-settings-accent');
        const text = column('frodo-settings-line-text');
        text.x_expand = true;
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(label('Onde a ilha fica', 'frodo-settings-text'));
        text.add_child(current);
        text.add_child(
            wrappedLabel(
                'A ilha flutua logo abaixo da barra superior. Nos cantos e no meio das laterais, encosta na borda; embaixo, abre para cima.',
                'frodo-settings-subtitle',
            ),
        );
        const picker = column('frodo-position-grid');
        picker.y_align = Clutter.ActorAlign.CENTER;
        const cells: {id: PillPosition; label: string; button: St.Button}[] = [];
        POSITION_GRID.forEach(cellsInRow => {
            const line = row('frodo-position-row');
            line.layout_manager.homogeneous = true;
            cellsInRow.forEach(cell => {
                if (!cell) {
                    line.add_child(new St.Widget({style_class: 'frodo-position-screen', x_expand: true}));
                    return;
                }
                const mark = new St.Widget({
                    style_class: 'frodo-position-mark',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                const button = contentButton(
                    'frodo-position-cell',
                    mark,
                    () => {
                        settings.pillPosition = cell.id;
                    },
                    {x_expand: true, accessible_name: cell.label},
                );
                cells.push({...cell, button});
                line.add_child(button);
            });
            picker.add_child(line);
        });
        this.#bindings.add(() => {
            const position = settings.pillPosition;
            for (const cell of cells) cell.button.checked = cell.id === position;
            current.text = cells.find(cell => cell.id === position)?.label ?? '';
        });
        const item = row('frodo-settings-line');
        item.add_child(text);
        item.add_child(picker);
        item.add_child(strut());
        return group('Posição', [item]);
    }

    #screen(): St.BoxLayout {
        const settings = this.#settings;
        return group('Tela', [
            line(
                'Monitores',
                'Em Ambos, cada tela tem a sua ilha',
                this.#bindings.segmented(
                    MONITORS,
                    () => settings.monitors,
                    mode => {
                        settings.monitors = mode;
                    },
                ),
            ),
            line(
                'Fundo',
                'Fosco desfoca o que está atrás. Use Sólido se a abertura ficar pesada.',
                this.#bindings.segmented(
                    SURFACES,
                    () => settings.surfaceStyle,
                    style => {
                        settings.surfaceStyle = style;
                    },
                ),
            ),
            line(
                'Ocultar barra superior',
                'Relógio, bandeja e indicadores passam a viver na ilha',
                this.#bindings.switch(
                    'Ocultar barra superior',
                    () => settings.hideTopBar,
                    checked => {
                        settings.hideTopBar = checked;
                    },
                ),
            ),
        ]);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
