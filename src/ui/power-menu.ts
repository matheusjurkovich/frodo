import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {systemActions} from '../shell/internals.js';
import type {SystemActionsRuntime} from '../shell/internals.js';
import type {Disposer} from '../util/disposables.js';
import type {Island} from './island.js';
import {roundButton} from './widgets.js';

interface PowerAction {
    readonly label: string;
    readonly icon: string;
    readonly run: (actions: SystemActionsRuntime) => void;
}

const ACTIONS: readonly PowerAction[] = [
    {
        label: 'Bloquear',
        icon: 'system-lock-screen-symbolic',
        run: actions => {
            actions.activateLockScreen();
        },
    },
    {
        label: 'Suspender',
        icon: 'media-playback-pause-symbolic',
        run: actions => {
            actions.activateSuspend();
        },
    },
    {
        label: 'Sair',
        icon: 'system-log-out-symbolic',
        run: actions => {
            actions.activateLogout();
        },
    },
    {
        label: 'Reiniciar',
        icon: 'system-reboot-symbolic',
        run: actions => {
            actions.activateRestart();
        },
    },
    {
        label: 'Desligar',
        icon: 'system-shutdown-symbolic',
        run: actions => {
            actions.activatePowerOff();
        },
    },
];

export class PowerMenu {
    readonly button: St.Button;
    readonly #menu: PopupMenu.PopupMenu;
    readonly #manager: PopupMenu.PopupMenuManager;
    readonly #release: Disposer;

    constructor(island: Island) {
        this.button = roundButton('system-shutdown-symbolic', 'Energia', () => {
            this.#menu.toggle();
        });
        this.#menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.TOP);
        this.#menu.actor.add_style_class_name('frodo-menu');
        Main.layoutManager.uiGroup.add_child(this.#menu.actor);
        this.#menu.actor.hide();
        this.#manager = new PopupMenu.PopupMenuManager(this.button);
        this.#manager.addMenu(this.#menu);
        this.#release = island.holdWhileOpen(this.#menu);

        const actions = systemActions();
        for (const action of ACTIONS) {
            this.#menu.addAction(
                action.label,
                () => {
                    island.close();
                    action.run(actions);
                },
                Gio.ThemedIcon.new(action.icon),
            );
        }
    }

    destroy(): void {
        this.#release();
        this.#manager.removeMenu(this.#menu);
        this.#menu.destroy();
        this.button.destroy();
    }
}
