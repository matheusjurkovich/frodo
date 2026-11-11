import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {tabToOpen, visibleTabs} from '../settings/tabs.js';
import {TAB_IDS} from '../settings/schema-values.const.js';
import type {TabId} from '../settings/schema-values.types.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import {Disposables} from '../shared/disposables.js';
import {SPRING} from '../shared/spring.const.js';
import {column} from '../shared/ui/layout.js';
import {morphSize, settle, slideIn, slideOut} from '../shared/ui/motion.js';
import {HEIGHT_AXIS} from '../shared/ui/motion.const.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {Header} from './header.js';
import {PowerMenu} from './power-menu.js';
import {SettingsPage} from '../tabs/settings/settings-page.js';
import {TabBar} from './tab-bar.js';
import {createTabPages} from './tab-pages.js';
import {IdleView} from '../pill/idle-view.js';
import type {PanelView, PanelDependencies} from './panel-content.types.js';

export class PanelContent {
    readonly actor = column('frodo-panel-content');
    readonly #settings: FrodoSettings;
    readonly #tabBar: TabBar;
    readonly #header: Header;
    readonly #pages: ReadonlyMap<TabId, Component>;
    readonly #settingsPage: Component;
    readonly #preview: IdleView;
    readonly #stack = new St.Viewport({style_class: 'frodo-pages', layout_manager: new Clutter.BinLayout(), x_expand: true});
    readonly #scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.EXTERNAL,
        x_expand: true,
        child: this.#stack,
    });
    readonly #disposables = new Disposables();
    #power: PowerMenu | null = null;
    #view: PanelView = {kind: 'tab', tab: TAB_IDS[0]};
    #lastTab: TabId = TAB_IDS[0];
    #nextTab: TabId | null = null;

    constructor(dependencies: PanelDependencies) {
        const {island, claude, sessions, codex, gemini, settings, state, bridge, recording} = dependencies;
        this.#settings = settings;

        this.#tabBar = new TabBar();
        this.#header = new Header(
            this.#tabBar,
            {
                openSettings: () => {
                    if (this.#view.kind === 'settings') this.#leaveSettings();
                    else this.show({kind: 'settings'}, true);
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
        this.#preview = new IdleView({settings, state, claude, codex, gemini, bridge});
        this.#settingsPage = new SettingsPage(settings, sessions, this.#preview.actor, {
            back: () => {
                this.#leaveSettings();
            },
            close: () => {
                island.close();
            },
            grabKeyboard: focus => {
                island.grabKeyboard(focus);
            },
            overlay: island.overlay,
        });
        this.#disposables.add(
            island.on('opening', () => {
                const visible = visibleTabs(settings.hiddenTabs, settings.tabOrder);
                this.show({kind: 'tab', tab: tabToOpen(this.#nextTab ?? visible[0] ?? TAB_IDS[0], visible)});
                this.#nextTab = null;
            }),
        );
        this.#pages = createTabPages({
            ...dependencies,
            actions: {
                scrollToTop: () => {
                    this.#scrollToTop();
                },
                openSettings: () => {
                    this.show({kind: 'settings'}, true);
                },
            },
        });
        for (const page of this.#pages.values()) this.#stack.add_child(page.actor);
        this.#stack.add_child(this.#settingsPage.actor);
        for (const page of this.#allActors()) page.y_align = Clutter.ActorAlign.START;
        this.actor.clip_to_allocation = true;
        this.actor.add_child(this.#header.actor);
        this.actor.add_child(this.#scroll);

        this.#disposables.add(
            this.#tabBar.on('selected', tab => {
                this.show({kind: 'tab', tab}, true);
            }),
        );
        this.#disposables.add(
            settings.onChanged(['hidden-tabs', 'tab-order'], () => {
                this.#syncTabs();
            }),
        );
        this.#disposables.add(
            bridge.on('changed', () => {
                this.#tabBar.setBadge('notifications', bridge.count);
            }),
        );
        this.#tabBar.setBadge('notifications', bridge.count);
        this.#syncTabs();
    }

    show(view: PanelView, animate = false): void {
        const from = this.#actorOf(this.#view);
        const to = this.#actorOf(view);
        const direction = this.#order(view) > this.#order(this.#view) ? 1 : -1;
        this.#view = view;
        const tab = view.kind === 'tab' ? view.tab : null;
        if (tab) this.#lastTab = tab;
        if (animate && from !== to && this.actor.mapped) this.#slide(from, to, direction);
        else {
            for (const page of this.#allActors()) {
                settle(page);
                page.visible = page === to;
            }
        }
        this.#tabBar.select(tab, animate);
        this.#header.setSettingsActive(view.kind === 'settings');
        this.#scrollToTop();
    }

    #slide(from: Clutter.Actor, to: Clutter.Actor, direction: 1 | -1): void {
        for (const page of this.#allActors())
            if (page !== from && page !== to) {
                settle(page);
                page.hide();
            }
        settle(to);
        this.#scrollToTop();
        morphSize(
            this.#scroll,
            () => {
                from.hide();
                to.show();
            },
            SPRING,
            HEIGHT_AXIS,
        );
        from.show();
        slideOut(from, direction, () => {
            from.hide();
            settle(from);
        });
        slideIn(to, direction);
    }

    #actorOf(view: PanelView): Clutter.Actor {
        return view.kind === 'tab' ? (this.#pages.get(view.tab)?.actor ?? this.#settingsPage.actor) : this.#settingsPage.actor;
    }

    #order(view: PanelView): number {
        return view.kind === 'tab' ? this.#settings.tabOrder.indexOf(view.tab) : TAB_IDS.length;
    }

    #allActors(): Clutter.Actor[] {
        return [...[...this.#pages.values()].map(page => page.actor), this.#settingsPage.actor];
    }

    prewarm(): () => void {
        for (const page of this.#allActors()) page.show();
        return () => {
            this.show(this.#view);
        };
    }

    showOnNextOpen(tab: TabId): void {
        this.#nextTab = tab;
    }

    #scrollToTop(): void {
        this.#scroll.vadjustment.value = 0;
    }

    #leaveSettings(): void {
        this.show({kind: 'tab', tab: tabToOpen(this.#lastTab, visibleTabs(this.#settings.hiddenTabs, this.#settings.tabOrder))}, true);
    }

    #syncTabs(): void {
        const visible = visibleTabs(this.#settings.hiddenTabs, this.#settings.tabOrder);
        this.#tabBar.setVisible(visible);
        this.show(this.#view.kind === 'tab' ? {kind: 'tab', tab: tabToOpen(this.#view.tab, visible)} : this.#view);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#power?.destroy();
        this.#tabBar.destroy();
        this.#header.destroy();
        this.#preview.destroy();
        this.#settingsPage.destroy();
        for (const page of this.#pages.values()) page.destroy();
        this.actor.destroy();
    }
}
