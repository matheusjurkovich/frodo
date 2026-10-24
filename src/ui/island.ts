import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {centerClamp} from '../core/geometry.js';
import type {InterceptedNotification} from '../services/notification-bridge.js';
import type {FrodoSettings} from '../services/settings.js';
import type {SystemState} from '../services/system-state.js';
import {Disposables} from '../util/disposables.js';
import type {Disposer} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {Pill} from './pill.js';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 300;
const ANIMATION_MS = 250;
const CLAUDE_MAX_AGE_SECONDS = 60;

export type OpenReason = 'hover' | 'click' | 'key';

export interface IslandEvents {
    opening: [];
    opened: [];
    closed: [];
}

export class Island extends Emitter<IslandEvents> {
    readonly pill: Pill;
    readonly panel = new St.Bin({style_class: 'frodo-panel', reactive: true, track_hover: true, visible: false});

    readonly #state: SystemState;
    readonly #grab = new GrabHelper(this.panel, {actionMode: Shell.ActionMode.POPUP});
    readonly #openTimer = new Timer();
    readonly #closeTimer = new Timer();
    readonly #disposables = new Disposables();
    #isOpen = false;
    #openedBy: OpenReason | null = null;
    #holds = 0;

    constructor(settings: FrodoSettings, state: SystemState) {
        super();
        this.#state = state;
        this.pill = new Pill(settings, state);

        const pill = this.pill.actor;
        this.#disposables.add(
            this.pill.on('rebuilt', () => {
                this.#syncMemoryNeed();
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('notify::hover', () => {
                this.#onPillHover();
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('button-press-event', (_actor, event) => {
                if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
                this.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.#disposables.signal(
            this.panel,
            this.panel.connect('notify::hover', () => {
                this.#onPanelHover();
            }),
        );
        this.#disposables.signal(
            this.panel,
            this.panel.connect('key-press-event', (_actor, event) => {
                if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
                this.close();
                return Clutter.EVENT_STOP;
            }),
        );
        this.#syncMemoryNeed();
    }

    get isOpen(): boolean {
        return this.#isOpen;
    }

    setContent(content: Clutter.Actor | null): void {
        this.panel.set_child(content);
    }

    flash(notification: InterceptedNotification): void {
        if (!this.#isOpen) this.pill.flash(notification);
    }

    holdWhileOpen(menu: PopupMenu.PopupMenu): Disposer {
        let held = false;
        const id = menu.connect('open-state-changed', (_menu, open) => {
            if (open === held) return;
            held = open;
            this.#holds += open ? 1 : -1;
            this.#onPanelHover();
        });
        return () => {
            menu.disconnect(id);
            if (held) this.#holds--;
        };
    }

    toggle(): void {
        if (this.#isOpen) this.close();
        else this.open('key');
    }

    open(reason: OpenReason): void {
        if (this.#isOpen) return;
        this.#openTimer.stop();
        this.pill.cancelFlash();
        this.#isOpen = true;
        this.#openedBy = reason;
        this.pill.actor.reactive = false;
        this.#syncMemoryNeed();
        void this.#state.refreshClaude(CLAUDE_MAX_AGE_SECONDS);

        this.emit('opening');
        this.#animateOpen();
        if (reason !== 'hover')
            this.#grab.grab({
                actor: this.panel,
                focus: this.panel,
                onUngrab: () => {
                    this.close();
                },
            });
        this.emit('opened');
    }

    close(): void {
        if (!this.#isOpen) return;
        this.#isOpen = false;
        this.#openedBy = null;
        this.pill.actor.reactive = true;
        this.#openTimer.stop();
        this.#closeTimer.stop();
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});

        this.panel.ease({
            opacity: 0,
            ...this.#collapsedScale(),
            duration: ANIMATION_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this.panel.hide();
            },
        });
        this.pill.actor.ease({opacity: 255, duration: ANIMATION_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.#syncMemoryNeed();
        this.emit('closed');
    }

    #animateOpen(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        panel.remove_all_transitions();
        panel.opacity = 0;
        panel.show();

        const [pillX, pillY] = pill.get_transformed_position();
        const [, naturalWidth] = panel.get_preferred_width(-1);
        const monitor = Main.layoutManager.findMonitorForActor(pill) ?? Main.layoutManager.primaryMonitor;
        if (monitor) panel.set_position(centerClamp(pillX, pill.width, naturalWidth, monitor.x, monitor.width), Math.round(pillY));
        panel.set_pivot_point((pillX + pill.width / 2 - panel.x) / Math.max(1, naturalWidth), 0);

        const collapsed = this.#collapsedScale();
        panel.scale_x = collapsed.scaleX;
        panel.scale_y = collapsed.scaleY;
        panel.ease({opacity: 255, scaleX: 1, scaleY: 1, duration: ANIMATION_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        pill.ease({opacity: 0, duration: ANIMATION_MS / 2, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    #collapsedScale(): {scaleX: number; scaleY: number} {
        const pill = this.pill.actor;
        const [, naturalWidth] = this.panel.get_preferred_width(-1);
        const [, naturalHeight] = this.panel.get_preferred_height(naturalWidth);
        return {
            scaleX: Math.min(1, Math.max(1, pill.width) / Math.max(1, naturalWidth)),
            scaleY: Math.min(1, Math.max(1, pill.height) / Math.max(1, naturalHeight)),
        };
    }

    #syncMemoryNeed(): void {
        this.#state.setMemoryWanted(this.#isOpen || this.pill.wantsMemory);
    }

    #onPillHover(): void {
        if (this.#isOpen) return;
        if (this.pill.actor.hover)
            this.#openTimer.once(OPEN_DELAY_MS, () => {
                this.open('hover');
            });
        else this.#openTimer.stop();
    }

    #onPanelHover(): void {
        if (!this.#isOpen) return;
        if (this.panel.hover || this.#holds > 0) this.#closeTimer.stop();
        else if (this.#openedBy === 'hover')
            this.#closeTimer.once(CLOSE_DELAY_MS, () => {
                this.close();
            });
    }

    destroy(): void {
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});
        this.#isOpen = false;
        this.#openTimer.stop();
        this.#closeTimer.stop();
        this.#disposables.dispose();
        this.clearListeners();
        this.pill.destroy();
        this.panel.destroy();
    }
}
