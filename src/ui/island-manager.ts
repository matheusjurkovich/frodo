import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {targetMonitors} from '../core/monitors.js';
import {tabToOpen, visibleTabs} from '../core/tabs.js';
import type {TabId} from '../core/types.js';
import type {ClaudeTranscripts} from '../services/claude-transcripts.js';
import type {Workspaces} from '../services/workspaces.js';
import {Disposables} from '../util/disposables.js';
import {Island} from './island.js';
import type {IslandDependencies} from './island.js';
import {PanelContent} from './panel/panel-content.js';

export interface IslandManagerDependencies extends IslandDependencies {
    readonly transcripts: ClaudeTranscripts;
    readonly workspaces: Workspaces;
    readonly openPreferences: () => void;
}

interface Entry {
    readonly island: Island;
    readonly content: PanelContent;
}

export class IslandManager {
    readonly #dependencies: IslandManagerDependencies;
    readonly #disposables = new Disposables();
    #entries: Entry[] = [];

    constructor(dependencies: IslandManagerDependencies) {
        this.#dependencies = dependencies;
        const {settings} = dependencies;
        this.#disposables.add(
            settings.onChanged(['monitors', 'hide-top-bar'], () => {
                this.#rebuild();
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

    closeAll(): void {
        for (const {island} of this.#entries) island.close();
    }

    #rebuild(): void {
        this.#clear();
        const {settings, claude, transcripts, sessions, bridge, media, workspaces, openPreferences} = this.#dependencies;
        const primary = Main.layoutManager.primaryIndex;
        for (const monitorIndex of targetMonitors(settings.monitors, primary, Main.layoutManager.monitors.length)) {
            const island = new Island(this.#dependencies, monitorIndex);
            island.setPlacement(monitorIndex === primary && !settings.hideTopBar ? 'bar' : 'float');
            island.on('opening', () => {
                for (const other of this.#entries) if (other.island !== island) other.island.close();
            });
            const content = new PanelContent({island, claude, transcripts, sessions, settings, bridge, media, workspaces, openPreferences});
            island.setContent(content.actor);
            island.on('tabRequested', tab => {
                content.showOnNextOpen(tab);
            });
            this.#entries.push({island, content});
        }
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
