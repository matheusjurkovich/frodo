import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {ClaudeService} from '../../services/claude-service.js';
import type {NotificationBridge} from '../../services/notification-bridge.js';
import type {FrodoSettings} from '../../services/settings.js';
import type {SystemState} from '../../services/system-state.js';
import {toggleOverview} from '../../shell/internals.js';
import {Disposables} from '../../util/disposables.js';
import {frodoIcon} from '../icons.js';
import type {FrodoIconName} from '../icons.js';
import type {Island} from '../island.js';
import {NativeDateMenu} from '../native-date-menu.js';
import {NativeQuickSettings} from '../native-quick-settings.js';
import {StatusRow} from '../status-row.js';
import {ClaudeTab} from './claude-tab.js';
import {headerSection, systemSection} from './sections.js';

export type TabId = 'controls' | 'calendar' | 'notifications' | 'system' | 'claude';

export interface PanelDependencies {
    readonly island: Island;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly settings: FrodoSettings;
    readonly bridge: NotificationBridge;
    readonly openPreferences: () => void;
}

interface Tab {
    readonly id: TabId;
    readonly icon: FrodoIconName;
    readonly label: string;
    readonly page: St.Widget;
}

interface TabButton {
    readonly button: St.Button;
    readonly label: St.Label;
}

function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

function tabButton(tab: Tab): TabButton {
    const box = new St.BoxLayout({style_class: 'frodo-tab-content'});
    const label = new St.Label({text: tab.label, y_align: Clutter.ActorAlign.CENTER});
    box.add_child(new St.Icon({gicon: frodoIcon(tab.icon), style_class: 'frodo-tab-icon'}));
    box.add_child(label);
    const button = new St.Button({style_class: 'frodo-tab', can_focus: true, child: box, accessible_name: tab.label});
    return {button, label};
}

export class PanelContent {
    readonly actor = column('frodo-panel-content');
    readonly #quickSettings: NativeQuickSettings;
    readonly #dateMenu: NativeDateMenu;
    readonly #status: StatusRow;
    readonly #claudeTab: ClaudeTab;
    readonly #disposables = new Disposables();
    #nextTab: TabId = 'controls';

    constructor({island, state, claude, settings, bridge, openPreferences}: PanelDependencies) {
        this.#quickSettings = new NativeQuickSettings(island);
        this.#dateMenu = new NativeDateMenu(island);
        this.#status = new StatusRow(island);
        this.#claudeTab = new ClaudeTab(claude, settings, {
            openPreferences,
            close: () => {
                island.close();
            },
        });

        const controls = column('frodo-section');
        controls.add_child(this.#quickSettings.actor);
        controls.add_child(this.#status.actor);

        const tabs: readonly Tab[] = [
            {id: 'controls', icon: 'controls', label: 'Controles', page: controls},
            {id: 'calendar', icon: 'calendar', label: 'Calendário', page: this.#dateMenu.calendar},
            {id: 'notifications', icon: 'bell', label: 'Notificações', page: this.#dateMenu.notifications},
            {id: 'system', icon: 'system', label: 'Sistema', page: systemSection(state)},
            {id: 'claude', icon: 'claude', label: 'Claude', page: this.#claudeTab.actor},
        ];

        const bar = new St.BoxLayout({style_class: 'frodo-tabbar', x_align: Clutter.ActorAlign.CENTER});
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        const buttons = tabs.map((tab, index) => {
            const item = tabButton(tab);
            item.button.connect('clicked', () => {
                select(index);
            });
            bar.add_child(item.button);
            stack.add_child(tab.page);
            return item;
        });
        const select = (selected: number): void => {
            tabs.forEach(({page}, index) => {
                page.visible = index === selected;
                if (index === selected) buttons[index]?.button.add_style_pseudo_class('checked');
                else buttons[index]?.button.remove_style_pseudo_class('checked');
            });
        };

        const notificationsTab = buttons[2];
        const syncCount = (): void => {
            const count = bridge.list().length;
            if (notificationsTab) notificationsTab.label.text = count > 0 ? `Notificações ${count}` : 'Notificações';
        };
        this.#disposables.add(bridge.on('changed', syncCount));
        this.#disposables.add(
            island.on('opening', () => {
                select(
                    Math.max(
                        0,
                        tabs.findIndex(tab => tab.id === this.#nextTab),
                    ),
                );
                this.#nextTab = 'controls';
            }),
        );
        syncCount();
        select(0);

        this.actor.add_child(
            headerSection({
                openPreferences,
                openOverview: () => {
                    island.close();
                    toggleOverview();
                },
            }),
        );
        this.actor.add_child(bar);
        this.actor.add_child(stack);
    }

    showOnNextOpen(tab: TabId): void {
        this.#nextTab = tab;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#claudeTab.destroy();
        this.#status.destroy();
        this.#quickSettings.destroy();
        this.#dateMenu.destroy();
        this.actor.destroy();
    }
}
