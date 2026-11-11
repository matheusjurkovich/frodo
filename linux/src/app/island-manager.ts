import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {targetMonitors} from './monitors.js';
import {tabToOpen, visibleTabs} from '../settings/tabs.js';
import type {TabId} from '../settings/schema-values.types.js';
import {Disposables} from '../shared/disposables.js';
import {Timer} from '../shared/timer.js';
import {Island} from './island.js';
import {PanelContent} from './panel-content.js';
import type {FrodoServices} from './services.types.js';
import type {Entry} from './island-manager.types.js';
import {PREWARM_DELAY_MS} from './island-manager.const.js';

export class IslandManager {
    readonly #dependencies: FrodoServices;
    readonly #disposables = new Disposables();
    readonly #prewarm = new Timer();
    #entries: Entry[] = [];

    constructor(dependencies: FrodoServices) {
        this.#dependencies = dependencies;
        const {settings} = dependencies;
        this.#disposables.add(
            settings.onChanged('monitors', () => {
                this.#reconcile();
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
        this.#currentEntry()?.island.openTab(
            tabToOpen(tab, visibleTabs(this.#dependencies.settings.hiddenTabs, this.#dependencies.settings.tabOrder)),
        );
    }

    #currentEntry(): Entry | undefined {
        const current = global.display.get_current_monitor();
        return this.#entries.find(entry => entry.island.monitorIndex === current) ?? this.#entries[0];
    }

    #rebuild(): void {
        this.#clear();
        this.#reconcile();
    }

    #reconcile(): void {
        const {settings} = this.#dependencies;
        const targets = targetMonitors(settings.monitors, Main.layoutManager.primaryIndex, Main.layoutManager.monitors.length);
        const kept = this.#entries.filter(entry => targets.includes(entry.island.monitorIndex));
        for (const entry of this.#entries) if (!kept.includes(entry)) this.#destroyEntry(entry);
        this.#entries = kept;
        for (const monitorIndex of targets) {
            if (kept.some(entry => entry.island.monitorIndex === monitorIndex)) continue;
            const island = new Island(this.#dependencies, monitorIndex);
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
        if (this.#entries.length === 0) this.#dependencies.state.setMemoryWanted(false);
        this.#prewarm.once(PREWARM_DELAY_MS, () => {
            for (const entry of this.#entries) entry.island.prewarm(() => entry.content.prewarm());
        });
    }

    #destroyEntry({island, content}: Entry): void {
        island.close(false);
        island.setContent(null);
        content.destroy();
        island.destroy();
    }

    #clear(): void {
        for (const entry of this.#entries) this.#destroyEntry(entry);
        this.#entries = [];
    }

    destroy(): void {
        this.#prewarm.stop();
        this.#disposables.dispose();
        this.#clear();
        this.#dependencies.state.setMemoryWanted(false);
    }
}
