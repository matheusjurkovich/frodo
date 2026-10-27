import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {tabToOpen, visibleTabs} from '../../core/tabs.js';
import {TAB_IDS} from '../../core/types.js';
import type {TabId} from '../../core/types.js';
import type {ClaudeService} from '../../services/claude-service.js';
import type {NotificationBridge} from '../../services/notification-bridge.js';
import type {FrodoSettings} from '../../services/settings.js';
import {Disposables} from '../../util/disposables.js';
import {column} from '../components/layout.js';
import type {Component} from '../components/lifecycle.js';
import type {Island} from '../island.js';
import {NativeDateMenu} from '../native-date-menu.js';
import {NativeQuickSettings} from '../native-quick-settings.js';
import {StatusRow} from '../status-row.js';
import {ClaudeTab} from './claude-tab.js';
import {Header} from './header.js';
import {TabBar} from './tab-bar.js';
import type {TabSpec} from './tab-bar.js';

export type PanelView = {readonly kind: 'tab'; readonly tab: TabId} | {readonly kind: 'settings'};

export interface PanelDependencies {
    readonly island: Island;
    readonly claude: ClaudeService;
    readonly settings: FrodoSettings;
    readonly bridge: NotificationBridge;
    readonly openPreferences: () => void;
}

function general(island: Island): Component {
    const quickSettings = new NativeQuickSettings(island);
    const status = new StatusRow(island);
    const actor = column('frodo-section');
    actor.add_child(quickSettings.actor);
    actor.add_child(status.actor);
    return {
        actor,
        destroy: () => {
            status.destroy();
            quickSettings.destroy();
            actor.destroy();
        },
    };
}

function borrowed(actor: Clutter.Actor): Component {
    return {actor, destroy: () => undefined};
}

export class PanelContent {
    readonly actor = column('frodo-panel-content');
    readonly #settings: FrodoSettings;
    readonly #dateMenu: NativeDateMenu;
    readonly #tabBar: TabBar;
    readonly #header: Header;
    readonly #pages = new Map<TabId, Component>();
    readonly #disposables = new Disposables();
    #view: PanelView = {kind: 'tab', tab: TAB_IDS[0]};
    #nextTab: TabId = TAB_IDS[0];

    constructor({island, claude, settings, bridge, openPreferences}: PanelDependencies) {
        this.#settings = settings;
        this.#dateMenu = new NativeDateMenu(island);

        const specs: readonly TabSpec[] = [
            {id: 'general', icon: 'general', label: 'Geral', create: () => general(island)},
            {id: 'calendar', icon: 'calendar', label: 'Calendário', create: () => borrowed(this.#dateMenu.calendar)},
            {
                id: 'claude',
                icon: 'claude',
                label: 'Claude',
                create: () =>
                    new ClaudeTab(claude, settings, {
                        openPreferences,
                        close: () => {
                            island.close();
                        },
                    }),
            },
            {id: 'notifications', icon: 'bell', label: 'Notificações', create: () => borrowed(this.#dateMenu.notifications)},
        ];

        this.#tabBar = new TabBar(specs);
        this.#header = new Header(this.#tabBar, {
            openSettings: openPreferences,
            collapse: () => {
                island.close();
            },
        });
        const stack = new St.Widget({style_class: 'frodo-pages', layout_manager: new Clutter.BinLayout(), x_expand: true});
        for (const spec of specs) {
            const page = spec.create();
            this.#pages.set(spec.id, page);
            stack.add_child(page.actor);
        }
        this.actor.add_child(this.#header.actor);
        this.actor.add_child(stack);

        this.#disposables.add(
            this.#tabBar.on('selected', tab => {
                this.show({kind: 'tab', tab});
            }),
        );
        this.#disposables.add(
            settings.onChanged('hidden-tabs', () => {
                this.#syncTabs();
            }),
        );
        this.#disposables.add(
            bridge.on('changed', () => {
                this.#tabBar.setBadge('notifications', bridge.list().length);
            }),
        );
        this.#disposables.add(
            island.on('opening', () => {
                this.show({kind: 'tab', tab: tabToOpen(this.#nextTab, visibleTabs(settings.hiddenTabs))});
                this.#nextTab = TAB_IDS[0];
            }),
        );
        this.#tabBar.setBadge('notifications', bridge.list().length);
        this.#syncTabs();
    }

    show(view: PanelView): void {
        this.#view = view;
        const tab = view.kind === 'tab' ? view.tab : null;
        for (const [id, page] of this.#pages) page.actor.visible = id === tab;
        this.#tabBar.select(tab);
        this.#header.setSettingsActive(view.kind === 'settings');
    }

    showOnNextOpen(tab: TabId): void {
        this.#nextTab = tab;
    }

    #syncTabs(): void {
        const visible = visibleTabs(this.#settings.hiddenTabs);
        this.#tabBar.setVisible(visible);
        this.show(this.#view.kind === 'tab' ? {kind: 'tab', tab: tabToOpen(this.#view.tab, visible)} : this.#view);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#tabBar.destroy();
        this.#header.destroy();
        for (const page of this.#pages.values()) page.destroy();
        this.#dateMenu.destroy();
        this.actor.destroy();
    }
}
