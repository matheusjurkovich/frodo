import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {dateMenuContainer, panelCenterBox, sessionPanelHas, toggleDateMenu} from '../shell/internals.js';
import type {FrodoSettings} from '../services/settings.js';
import {Disposables} from '../util/disposables.js';
import type {Island} from './island.js';

const FLOAT_TOP = 6;

type Placement = 'bar' | 'float';

export class TopBar {
    readonly #island: Island;
    readonly #settings: FrodoSettings;
    readonly #disposables = new Disposables();
    #placement: Placement | null = null;
    #dateMenu: Clutter.Actor | null = null;

    constructor(island: Island, settings: FrodoSettings) {
        this.#island = island;
        this.#settings = settings;
        const pill = island.pill.actor;
        this.#disposables.add(
            settings.onChanged('hide-top-bar', () => {
                this.#apply();
            }),
        );
        this.#disposables.signal(
            Main.layoutManager,
            Main.layoutManager.connect('monitors-changed', () => {
                this.#place();
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('notify::width', () => {
                this.#place();
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('button-press-event', (_actor, event) => {
                if (event.get_button() !== Clutter.BUTTON_SECONDARY) return Clutter.EVENT_PROPAGATE;
                toggleDateMenu();
                return Clutter.EVENT_STOP;
            }),
        );
        this.#apply();
    }

    #apply(): void {
        this.#detach();
        if (this.#settings.hideTopBar) this.#attachFloating();
        else this.#attachToBar();
    }

    #attachFloating(): void {
        const {panelBox} = Main.layoutManager;
        Main.layoutManager.untrackChrome(panelBox);
        panelBox.hide();
        Main.layoutManager.addTopChrome(this.#island.pill.actor, {trackFullscreen: true, affectsStruts: false});
        this.#placement = 'float';
        this.#place();
    }

    #attachToBar(): void {
        const pill = this.#island.pill.actor;
        const center = panelCenterBox();
        this.#dateMenu = dateMenuContainer();
        const index = this.#dateMenu ? center.get_children().indexOf(this.#dateMenu) : -1;
        this.#dateMenu?.hide();
        pill.fixed_position_set = false;
        pill.y_align = Clutter.ActorAlign.CENTER;
        center.insert_child_at_index(pill, Math.max(0, index));
        this.#placement = 'bar';
    }

    #detach(): void {
        const pill = this.#island.pill.actor;
        if (this.#placement === 'bar') {
            pill.get_parent()?.remove_child(pill);
            if (sessionPanelHas('dateMenu')) this.#dateMenu?.show();
        } else if (this.#placement === 'float') {
            const {panelBox} = Main.layoutManager;
            Main.layoutManager.removeChrome(pill);
            Main.layoutManager.trackChrome(panelBox, {affectsStruts: true, trackFullscreen: true});
            panelBox.show();
        }
        this.#placement = null;
    }

    #place(): void {
        if (this.#placement !== 'float') return;
        const monitor = Main.layoutManager.primaryMonitor;
        const pill = this.#island.pill.actor;
        if (monitor) pill.set_position(Math.round(monitor.x + (monitor.width - pill.width) / 2), monitor.y + FLOAT_TOP);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#detach();
    }
}
