import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {NotificationBridge} from '../../services/notification-bridge.js';
import type {SystemState} from '../../services/system-state.js';
import type {Island} from '../island.js';
import {NativeQuickSettings} from '../native-quick-settings.js';
import {NotificationList} from '../notification-list.js';
import {TrayRow} from '../tray-row.js';
import {claudeSection, headerSection, systemSection} from './sections.js';

export interface PanelDependencies {
    readonly island: Island;
    readonly state: SystemState;
    readonly bridge: NotificationBridge;
    readonly openPreferences: () => void;
}

interface Tab {
    readonly label: string;
    readonly page: St.Widget;
}

function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

export class PanelContent {
    readonly actor = column('frodo-panel-content');
    readonly #quickSettings: NativeQuickSettings;
    readonly #notifications: NotificationList;
    readonly #tray: TrayRow;
    readonly #bell: St.Button;

    constructor({island, state, bridge, openPreferences}: PanelDependencies) {
        this.#quickSettings = new NativeQuickSettings(island);
        this.#notifications = new NotificationList(bridge, island);
        this.#tray = new TrayRow(island);

        const controls = column('frodo-section');
        controls.add_child(this.#quickSettings.actor);
        controls.add_child(this.#tray.actor);
        const notifications = column('frodo-section');
        notifications.add_child(this.#notifications.actor);

        const tabs: readonly Tab[] = [
            {label: 'Controles', page: controls},
            {label: 'Sistema', page: systemSection(state)},
            {label: 'Claude', page: claudeSection(state)},
            {label: '🔔', page: notifications},
        ];

        const bar = new St.BoxLayout({style_class: 'frodo-tabbar', x_align: Clutter.ActorAlign.CENTER});
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        const buttons = tabs.map(({label, page}, index) => {
            const button = new St.Button({label, style_class: 'frodo-tab', can_focus: true});
            button.connect('clicked', () => {
                select(index);
            });
            bar.add_child(button);
            stack.add_child(page);
            return button;
        });
        const select = (selected: number): void => {
            tabs.forEach(({page}, index) => {
                page.visible = index === selected;
                if (index === selected) buttons[index]?.add_style_pseudo_class('checked');
                else buttons[index]?.remove_style_pseudo_class('checked');
            });
        };
        this.#bell = buttons[tabs.length - 1] ?? new St.Button();

        const syncCount = (): void => {
            const count = bridge.list().length;
            this.#bell.label = count > 0 ? `🔔 ${count}` : '🔔';
        };
        const unsubscribe = bridge.on('changed', syncCount);
        this.actor.connect('destroy', unsubscribe);
        syncCount();
        select(0);

        this.actor.add_child(headerSection(openPreferences));
        this.actor.add_child(bar);
        this.actor.add_child(stack);
    }

    destroy(): void {
        this.#tray.destroy();
        this.#quickSettings.destroy();
        this.#notifications.destroy();
        this.actor.destroy();
    }
}
