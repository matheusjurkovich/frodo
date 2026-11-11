import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {TAB_IDS} from '../../settings/schema-values.const.js';
import type {TabId} from '../../settings/schema-values.types.js';
import {visibleTabs} from '../../settings/tabs.js';
import {TAB_LABELS} from '../../settings/tabs.const.js';
import {Disposables} from '../../shared/disposables.js';
import {moveTo} from '../../shared/reorder.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {Switch} from '../../shared/ui/switch.js';
import {orderCells, ReorderableList} from './reorderable-list.js';
import {line} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import type {TabsSectionDependencies} from './tabs-section.types.js';

export class TabsSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #settings: FrodoSettings;
    readonly #disposables = new Disposables();
    readonly #list = card('frodo-settings-group-card');
    readonly #order: ReorderableList<TabId>;

    constructor(deps: TabsSectionDependencies) {
        this.#settings = deps.settings;
        this.#order = this.#disposables.own(new ReorderableList<TabId>(deps.overlay, 'y'));
        const section = column('frodo-settings-group');
        section.add_child(label('Abas visíveis', 'frodo-settings-group-title'));
        section.add_child(this.#list);
        section.add_child(
            wrappedLabel(
                'Arraste para mudar a ordem das abas na ilha. Pelo teclado, foque a alça e use ↑ ↓. Uma aba escondida continua abrindo pelo atalho dela.',
                'frodo-settings-hint',
            ),
        );
        this.actor.add_child(section);
        this.#disposables.add(
            deps.settings.onChanged(['hidden-tabs', 'tab-order'], () => {
                this.#render();
            }),
        );
        this.#render();
    }

    #render(): void {
        const settings = this.#settings;
        const list = this.#list;
        this.#order.clear();
        list.destroy_all_children();
        const order = settings.tabOrder;
        const visible = visibleTabs(settings.hiddenTabs, order);
        this.#order.render({
            ids: order,
            handleName: id => `Reordenar a aba ${TAB_LABELS[id]}: arraste ou use as setas`,
            item: (id, index, handle) => {
                const toggle = this.#order.own(new Switch(`Mostrar a aba ${TAB_LABELS[id]}`));
                toggle.checked = visible.includes(id);
                const locked = visible.length === 1 && visible.includes(id);
                toggle.actor.reactive = !locked;
                toggle.actor.can_focus = !locked;
                toggle.on('toggled', checked => {
                    const shown = visibleTabs(settings.hiddenTabs, settings.tabOrder).filter(tab => tab !== id);
                    if (checked) shown.push(id);
                    settings.hiddenTabs = TAB_IDS.filter(tab => !shown.includes(tab));
                });
                const title = row('frodo-tab-order-title');
                for (const cell of orderCells(handle, index, TAB_LABELS[id], 'frodo-settings-text')) title.add_child(cell);
                return line(title, null, toggle.actor);
            },
            mount: items => {
                for (const item of items) list.add_child(item);
                return actors => {
                    actors.forEach((actor, index) => {
                        if (actor.get_parent() !== list) list.insert_child_at_index(actor, index);
                        else list.set_child_at_index(actor, index);
                    });
                };
            },
            onReorder: (id, to) => {
                settings.tabOrder = moveTo(order, id, to);
            },
        });
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
