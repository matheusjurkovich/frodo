import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {OpenLayout} from '../../core/types.js';
import type {NotificationBridge} from '../../services/notification-bridge.js';
import type {SystemState} from '../../services/system-state.js';
import {Controls} from '../controls.js';
import type {Island} from '../island.js';
import {NotificationList} from '../notification-list.js';
import {PowerMenu} from '../power-menu.js';
import {TrayRow} from '../tray-row.js';
import {heading} from '../widgets.js';
import {claudeSection, headerSection, systemSection} from './sections.js';

export interface PanelDependencies {
    readonly island: Island;
    readonly state: SystemState;
    readonly bridge: NotificationBridge;
    readonly openPreferences: () => void;
}

function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

export class PanelContent {
    readonly actor: St.BoxLayout;
    readonly #controls: Controls;
    readonly #power: PowerMenu;
    readonly #notifications: NotificationList;
    readonly #tray: TrayRow;
    readonly #dependencies: PanelDependencies;

    constructor(layout: OpenLayout, dependencies: PanelDependencies) {
        this.#dependencies = dependencies;
        this.#controls = new Controls(dependencies.island);
        this.#power = new PowerMenu(dependencies.island);
        this.#notifications = new NotificationList(dependencies.bridge, dependencies.island);
        this.#tray = new TrayRow(dependencies.island);
        this.actor = layout === 'tabs' ? this.#tabs() : this.#single();
    }

    #header(): St.BoxLayout {
        return headerSection(this.#power.button, this.#dependencies.openPreferences);
    }

    #single(): St.BoxLayout {
        const root = column('frodo-panel-content');
        root.add_child(this.#header());

        const right = column('frodo-right');
        right.add_child(systemSection(this.#dependencies.state));
        right.add_child(claudeSection(this.#dependencies.state));
        const columns = new St.BoxLayout({style_class: 'frodo-cols', x_expand: true});
        columns.add_child(this.#controls.actor);
        columns.add_child(right);
        root.add_child(columns);

        const bottom = column('frodo-section');
        bottom.add_child(this.#tray.actor);
        bottom.add_child(heading('NOTIFICAÇÕES'));
        bottom.add_child(this.#notifications.actor);
        root.add_child(bottom);
        return root;
    }

    #tabs(): St.BoxLayout {
        const root = column('frodo-panel-content');
        root.add_child(this.#header());

        const controlsPage = column('frodo-section');
        controlsPage.add_child(this.#controls.actor);
        controlsPage.add_child(this.#tray.actor);
        const notificationsPage = column('frodo-section');
        notificationsPage.add_child(this.#notifications.actor);

        const pages: readonly (readonly [string, St.Widget])[] = [
            ['Controles', controlsPage],
            ['Sistema', systemSection(this.#dependencies.state)],
            ['Claude', claudeSection(this.#dependencies.state)],
            ['🔔', notificationsPage],
        ];

        const bar = new St.BoxLayout({style_class: 'frodo-tabbar', x_align: Clutter.ActorAlign.CENTER});
        const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
        const buttons = pages.map(([label, page], index) => {
            const button = new St.Button({label, style_class: 'frodo-tab', can_focus: true});
            button.connect('clicked', () => {
                select(index);
            });
            bar.add_child(button);
            stack.add_child(page);
            return button;
        });
        const select = (selected: number): void => {
            pages.forEach(([, page], index) => {
                page.visible = index === selected;
                if (index === selected) buttons[index]?.add_style_pseudo_class('checked');
                else buttons[index]?.remove_style_pseudo_class('checked');
            });
        };

        const bell = buttons[3];
        const syncCount = (): void => {
            const count = this.#dependencies.bridge.list().length;
            if (bell) bell.label = count > 0 ? `🔔 ${count}` : '🔔';
        };
        const unsubscribe = this.#dependencies.bridge.on('changed', syncCount);
        root.connect('destroy', unsubscribe);
        syncCount();
        select(0);

        root.add_child(bar);
        root.add_child(stack);
        return root;
    }

    destroy(): void {
        this.#tray.destroy();
        this.#notifications.destroy();
        this.#controls.destroy();
        this.actor.destroy();
        this.#power.destroy();
    }
}
