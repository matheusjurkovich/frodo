import Clutter from 'gi://Clutter';
import type {ClosedItem} from '../../settings/schema-values.types.js';
import {Disposables} from '../../shared/disposables.js';
import {moveTo} from '../../shared/reorder.js';
import {iconButton, textButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Wrap} from '../../shared/ui/wrap.js';
import {missingItems} from './pill-items.js';
import {ITEM_LABELS} from './pill-items.const.js';
import type {PillItemsEditorDependencies} from './pill-items-editor.types.js';
import {orderCells, ReorderableList} from './reorderable-list.js';

export class PillItemsEditor implements Component {
    readonly actor = column('frodo-pill-editor');
    readonly #deps: PillItemsEditorDependencies;
    readonly #disposables = new Disposables();
    readonly #order: ReorderableList<ClosedItem>;
    #stale = false;

    constructor(deps: PillItemsEditorDependencies) {
        this.#deps = deps;
        this.#order = this.#disposables.own(new ReorderableList<ClosedItem>(deps.overlay, 'x'));
        this.#disposables.add(
            deps.settings.onChanged(['closed-mode', 'closed-items', 'disabled-ai'], () => {
                if (this.actor.mapped) this.#render();
                else this.#stale = true;
            }),
        );
        this.#disposables.signal(
            this.actor,
            this.actor.connect('notify::mapped', () => {
                if (this.actor.mapped && this.#stale) this.#render();
            }),
        );
        this.#render();
    }

    #render(): void {
        this.#stale = false;
        const settings = this.#deps.settings;
        const editor = this.actor;
        this.#order.clear();
        editor.destroy_all_children();
        if (settings.closedMode === 'minimal') {
            editor.add_child(
                wrappedLabel(
                    'No modo Mínimo a pílula mostra só o relógio. Escolha Compacto ou Rotativo para montar os itens.',
                    'frodo-pill-note',
                ),
            );
            return;
        }

        const items = settings.closedItems;
        editor.add_child(label('Itens, da esquerda para a direita', 'frodo-settings-text'));
        this.#order.render({
            ids: items,
            handleName: item => `Reordenar ${ITEM_LABELS[item]}: arraste ou use as setas`,
            item: (item, index, handle) => {
                const chipBox = row('frodo-pill-item');
                chipBox.x_expand = false;
                for (const cell of orderCells(handle, index, ITEM_LABELS[item], 'frodo-pill-item-name')) chipBox.add_child(cell);
                const remove = iconButton(
                    frodoIcon('close'),
                    `Tirar ${ITEM_LABELS[item]} da pílula`,
                    () => {
                        settings.closedItems = items.filter(other => other !== item);
                    },
                    'ghost',
                    32,
                );
                remove.add_style_class_name('frodo-pill-item-remove');
                remove.y_align = Clutter.ActorAlign.CENTER;
                remove.reactive = items.length > 1;
                remove.can_focus = items.length > 1;
                chipBox.add_child(remove);
                return chipBox;
            },
            mount: chips => {
                const wrap = new Wrap('frodo-pill-items', chips);
                editor.add_child(wrap.actor);
                return actors => {
                    wrap.setItems(actors);
                };
            },
            onReorder: (item, to) => {
                settings.closedItems = moveTo(items, item, to);
            },
        });
        editor.add_child(wrappedLabel('Arraste os itens para mudar a ordem. Pelo teclado, foque a alça e use ← →.', 'frodo-settings-hint'));

        const missing = missingItems(items, settings.enabledProviders);
        if (missing.length === 0) return;
        editor.add_child(label('Adicionar', 'frodo-settings-text'));
        const available = missing.map(item => {
            const button = textButton(
                ITEM_LABELS[item],
                () => {
                    settings.closedItems = [...items, item];
                },
                'ghost',
                frodoIcon('plus'),
            );
            button.add_style_class_name('frodo-pill-add');
            button.accessible_name = `Adicionar ${ITEM_LABELS[item]} à pílula`;
            return button;
        });
        editor.add_child(new Wrap('frodo-pill-items', available).actor);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
