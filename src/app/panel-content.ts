import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {TAB_LABELS, tabToOpen, visibleTabs} from '../settings/tabs.js';
import {TAB_IDS} from '../settings/schema-values.js';
import type {TabId} from '../settings/schema-values.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import {Disposables} from '../shared/disposables.js';
import {column} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.js';
import type {Island} from './island.js';
import type {FrodoServices} from './services.js';
import {CalendarPage} from '../tabs/calendar/calendar-page.js';
import {ClaudePage} from '../tabs/claude/claude-page.js';
import {GeneralPage} from '../tabs/general/general-page.js';
import {Header} from './header.js';
import {NotificationsPage} from '../tabs/notifications/notifications-page.js';
import {PowerMenu} from './power-menu.js';
import {SettingsPage} from '../tabs/settings/settings-page.js';
import {TabBar} from './tab-bar.js';
import type {TabSpec} from './tab-bar.js';
import {WorkspacesPage} from '../tabs/workspaces/workspaces-page.js';

export type PanelView = {readonly kind: 'tab'; readonly tab: TabId} | {readonly kind: 'settings'};

export interface PanelDependencies extends FrodoServices {
    readonly island: Island;
}

export class PanelContent {
    readonly actor = column('frodo-panel-content');
    readonly #settings: FrodoSettings;
    readonly #tabBar: TabBar;
    readonly #header: Header;
    readonly #pages = new Map<TabId, Component>();
    readonly #settingsPage: Component;
    readonly #stack = new St.Viewport({style_class: 'frodo-pages', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        child: this.#stack,
    });
    readonly #disposables = new Disposables();
    #power: PowerMenu | null = null;
    #view: PanelView = {kind: 'tab', tab: TAB_IDS[0]};
    #lastTab: TabId = TAB_IDS[0];
    #nextTab: TabId = TAB_IDS[0];

    constructor({island, claude, transcripts, sessions, settings, bridge, media, workspaces, recording}: PanelDependencies) {
        this.#settings = settings;

        const specs: readonly TabSpec[] = [
            {
                id: 'general',
                icon: 'general',
                label: TAB_LABELS.general,
                create: () =>
                    new GeneralPage({
                        island,
                        settings,
                        media,
                        scrollToTop: () => {
                            this.#scrollToTop();
                        },
                    }),
            },
            {id: 'calendar', icon: 'calendar', label: TAB_LABELS.calendar, create: () => new CalendarPage(island)},
            {id: 'workspaces', icon: 'workspaces', label: TAB_LABELS.workspaces, create: () => new WorkspacesPage(workspaces, island)},
            {
                id: 'claude',
                icon: 'claude',
                label: TAB_LABELS.claude,
                create: () =>
                    new ClaudePage({
                        claude,
                        transcripts,
                        sessions,
                        settings,
                        actions: {
                            openSettings: () => {
                                this.show({kind: 'settings'});
                            },
                            close: () => {
                                island.close();
                            },
                        },
                    }),
            },
            {id: 'notifications', icon: 'bell', label: TAB_LABELS.notifications, create: () => new NotificationsPage(bridge, island)},
        ];

        this.#tabBar = new TabBar(specs);
        this.#header = new Header(
            this.#tabBar,
            {
                openSettings: () => {
                    if (this.#view.kind === 'settings') this.#leaveSettings();
                    else this.show({kind: 'settings'});
                },
                openPower: source => {
                    this.#power ??= new PowerMenu(source, island);
                    this.#power.toggle();
                },
                collapse: () => {
                    island.close();
                },
            },
            recording,
        );
        this.#settingsPage = new SettingsPage(settings, {
            back: () => {
                this.#leaveSettings();
            },
            close: () => {
                island.close();
            },
            grabKeyboard: focus => {
                island.grabKeyboard(focus);
            },
        });
        for (const spec of specs) {
            const page = spec.create();
            this.#pages.set(spec.id, page);
            this.#stack.add_child(page.actor);
        }
        this.#stack.add_child(this.#settingsPage.actor);
        this.actor.add_child(this.#header.actor);
        this.actor.add_child(this.#scroll);

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
                this.#tabBar.setBadge('notifications', bridge.count);
            }),
        );
        this.#disposables.add(
            island.on('opening', () => {
                this.show({kind: 'tab', tab: tabToOpen(this.#nextTab, visibleTabs(settings.hiddenTabs))});
                this.#nextTab = TAB_IDS[0];
            }),
        );
        this.#tabBar.setBadge('notifications', bridge.count);
        this.#syncTabs();
    }

    show(view: PanelView): void {
        this.#view = view;
        const tab = view.kind === 'tab' ? view.tab : null;
        if (tab) this.#lastTab = tab;
        for (const [id, page] of this.#pages) page.actor.visible = id === tab;
        this.#settingsPage.actor.visible = view.kind === 'settings';
        this.#tabBar.select(tab);
        this.#header.setSettingsActive(view.kind === 'settings');
        this.#scrollToTop();
    }

    showOnNextOpen(tab: TabId): void {
        this.#nextTab = tab;
    }

    #scrollToTop(): void {
        this.#scroll.vadjustment.value = 0;
    }

    #leaveSettings(): void {
        this.show({kind: 'tab', tab: tabToOpen(this.#lastTab, visibleTabs(this.#settings.hiddenTabs))});
    }

    #syncTabs(): void {
        const visible = visibleTabs(this.#settings.hiddenTabs);
        this.#tabBar.setVisible(visible);
        this.show(this.#view.kind === 'tab' ? {kind: 'tab', tab: tabToOpen(this.#view.tab, visible)} : this.#view);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#power?.destroy();
        this.#tabBar.destroy();
        this.#header.destroy();
        this.#settingsPage.destroy();
        for (const page of this.#pages.values()) page.destroy();
        this.actor.destroy();
    }
}
