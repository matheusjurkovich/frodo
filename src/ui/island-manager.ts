import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {targetMonitors} from '../core/monitors.js';
import {tabToOpen, visibleTabs} from '../core/tabs.js';
import type {TabId} from '../core/types.js';
import type {InterceptedNotification} from '../services/notification-bridge.js';
import type {ClaudeService} from '../services/claude-service.js';
import type {MediaService} from '../services/media.js';
import type {NotificationBridge} from '../services/notification-bridge.js';
import type {FrodoSettings} from '../services/settings.js';
import type {SystemState} from '../services/system-state.js';
import {Disposables} from '../util/disposables.js';
import {Island} from './island.js';
import {PanelContent} from './panel/panel-content.js';

export interface IslandManagerDependencies {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly bridge: NotificationBridge;
    readonly media: MediaService;
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

    flash(notification: InterceptedNotification): void {
        for (const {island} of this.#entries) island.flash(notification);
    }

    closeAll(): void {
        for (const {island} of this.#entries) island.close();
    }

    #rebuild(): void {
        this.#clear();
        const {settings, state, claude, bridge, media, openPreferences} = this.#dependencies;
        const primary = Main.layoutManager.primaryIndex;
        for (const monitorIndex of targetMonitors(settings.monitors, primary, Main.layoutManager.monitors.length)) {
            const island = new Island(settings, state, claude, monitorIndex);
            island.setPlacement(monitorIndex === primary && !settings.hideTopBar ? 'bar' : 'float');
            island.on('opening', () => {
                for (const other of this.#entries) if (other.island !== island) other.island.close();
            });
            const content = new PanelContent({island, claude, settings, bridge, media, openPreferences});
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
