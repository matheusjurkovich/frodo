import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {PillPosition} from '../../settings/schema-values.types.js';
import {Disposables} from '../../shared/disposables.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Bindings, strut} from './settings-rows.js';
import {POSITION_GRID} from './screen-section.const.js';

export class PositionPicker implements Component {
    readonly actor = row('frodo-settings-line');
    readonly #disposables = new Disposables();

    constructor(settings: FrodoSettings) {
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
        const grid = column('frodo-position-grid');
        grid.y_align = Clutter.ActorAlign.CENTER;
        const cells: {id: PillPosition; label: string; button: St.Button}[] = [];
        for (const cellsInRow of POSITION_GRID) {
            const line = row('frodo-position-row');
            line.layout_manager.homogeneous = true;
            for (const cell of cellsInRow) {
                if (!cell) {
                    line.add_child(new St.Widget({style_class: 'frodo-position-screen', x_expand: true}));
                    continue;
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
            }
            grid.add_child(line);
        }
        new Bindings(this.#disposables, settings).add(() => {
            const position = settings.pillPosition;
            for (const cell of cells) cell.button.checked = cell.id === position;
            current.text = cells.find(cell => cell.id === position)?.label ?? '';
        }, ['pill-position']);
        this.actor.add_child(text);
        this.actor.add_child(grid);
        this.actor.add_child(strut());
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
