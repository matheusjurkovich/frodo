import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import {TAB_IDS} from '../../settings/schema-values.const.js';
import type {TabId} from '../../settings/schema-values.types.js';
import {visibleTabs} from '../../settings/tabs.js';
import {TAB_LABELS} from '../../settings/tabs.const.js';
import {Disposables} from '../../shared/disposables.js';
import {moveTo} from '../../shared/reorder.js';
import {card} from '../../shared/ui/card.js';
import {dragReorder} from '../../shared/ui/drag-reorder.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {Switch} from '../../shared/ui/switch.js';
import {grip, line} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import type {TabsSectionDependencies} from './tabs-section.types.js';

export class TabsSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: TabsSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #list = card('frodo-settings-group-card');
    readonly #built = new Disposables();
    #focus: TabId | null = null;

    constructor(deps: TabsSectionDependencies) {
        this.#deps = deps;
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
        this.#disposables.add(() => {
            this.#built.dispose();
        });
        this.#render();
    }

    #render(): void {
        const settings = this.#deps.settings;
        const list = this.#list;
        this.#built.dispose();
        list.destroy_all_children();
        const order = settings.tabOrder;
        const visible = visibleTabs(settings.hiddenTabs, order);
        const handles: St.Button[] = [];
        const lines = order.map((id, index) => {
            const toggle = this.#built.own(new Switch(`Mostrar a aba ${TAB_LABELS[id]}`));
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
            const handle = grip(`Reordenar a aba ${TAB_LABELS[id]}: arraste ou use as setas`);
            handles.push(handle);
            title.add_child(handle);
            title.add_child(label(String(index + 1), 'frodo-pill-item-number frodo-mono'));
            title.add_child(label(TAB_LABELS[id], 'frodo-settings-text'));
            for (const child of title.get_children()) child.y_align = Clutter.ActorAlign.CENTER;
            const item = line(title, null, toggle.actor);
            list.add_child(item);
            return item;
        });
        this.#built.add(
            dragReorder({
                axis: 'y',
                host: this.#deps.overlay,
                items: lines,
                handles,
                arrange: actors => {
                    actors.forEach((actor, index) => {
                        if (actor.get_parent() !== list) list.insert_child_at_index(actor, index);
                        else list.set_child_at_index(actor, index);
                    });
                },
                onMove: (from, to) => {
                    const id = order[from];
                    if (id === undefined) return;
                    this.#focus = id;
                    settings.tabOrder = moveTo(order, id, to);
                },
            }),
        );
        const focus = this.#focus === null ? -1 : order.indexOf(this.#focus);
        this.#focus = null;
        handles[focus]?.grab_key_focus();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
