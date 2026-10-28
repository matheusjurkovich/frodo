import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {targetMonitors} from './monitors.js';
import {tabToOpen, visibleTabs} from '../settings/tabs.js';
import {isBottom} from '../settings/schema-values.js';
import type {TabId} from '../settings/schema-values.js';
import {Disposables} from '../shared/disposables.js';
import {Island} from './island.js';
import type {Placement} from './island.js';
import {PanelContent} from './panel-content.js';
import type {FrodoServices} from './services.js';

interface Entry {
    readonly island: Island;
    readonly content: PanelContent;
}

export class IslandManager {
    readonly #dependencies: FrodoServices;
    readonly #disposables = new Disposables();
    #entries: Entry[] = [];

    constructor(dependencies: FrodoServices) {
        this.#dependencies = dependencies;
        const {settings} = dependencies;
        this.#disposables.add(
            settings.onChanged(['monitors', 'hide-top-bar'], () => {
                this.#rebuild();
            }),
        );
        this.#disposables.add(
            settings.onChanged('pill-position', () => {
                for (const {island} of this.#entries) island.setPlacement(this.#placementFor(island.monitorIndex));
            }),
        );
        this.#disposables.signal(
            Main.layoutManager,
            Main.layoutManager.connect('monitors-changed', () => {
                this.#rebuild();
            }),
        );
        this.#rebuild();
    }

    toggle(): void {
        this.#currentEntry()?.island.toggle();
    }

    show(tab: TabId): void {
        this.#currentEntry()?.island.openTab(tabToOpen(tab, visibleTabs(this.#dependencies.settings.hiddenTabs)));
    }

    #currentEntry(): Entry | undefined {
        const current = global.display.get_current_monitor();
        return this.#entries.find(entry => entry.island.monitorIndex === current) ?? this.#entries[0];
    }

    #rebuild(): void {
        this.#clear();
        const {settings} = this.#dependencies;
        const primary = Main.layoutManager.primaryIndex;
        for (const monitorIndex of targetMonitors(settings.monitors, primary, Main.layoutManager.monitors.length)) {
            const island = new Island(this.#dependencies, monitorIndex);
            island.setPlacement(this.#placementFor(monitorIndex));
            island.on('opening', () => {
                for (const other of this.#entries) if (other.island !== island) other.island.close();
            });
            const content = new PanelContent({...this.#dependencies, island});
            island.setContent(content.actor);
            island.on('tabRequested', tab => {
                content.showOnNextOpen(tab);
            });
            this.#entries.push({island, content});
        }
    }

    #placementFor(monitorIndex: number): Placement {
        const {settings} = this.#dependencies;
        const bar = monitorIndex === Main.layoutManager.primaryIndex && !settings.hideTopBar && !isBottom(settings.pillPosition);
        return bar ? 'bar' : 'float';
    }

    #clear(): void {
        for (const {island, content} of this.#entries) {
            island.close();
            island.setContent(null);
            content.destroy();
            island.destroy();
        }
        this.#entries = [];
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#clear();
    }
}
