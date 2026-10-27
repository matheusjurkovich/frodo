import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {centerClamp} from '../core/geometry.js';
import type {TabId} from '../core/types.js';
import type {ClaudeService} from '../services/claude-service.js';
import type {ClaudeSessions} from '../services/claude-sessions.js';
import type {MediaService} from '../services/media.js';
import type {Recording} from '../services/recording.js';
import type {FrodoSettings} from '../services/settings.js';
import type {SystemState} from '../services/system-state.js';
import {dateMenuContainer, hasRealFullscreen, onFullscreenStateChanged, panelCenterBox, sessionPanelHas} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import type {Disposer} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import type {ActivityFeed} from './pill/activity-feed.js';
import {Pill} from './pill/pill.js';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 300;
const AUTO_CLOSE_MS = 5000;
const ANIMATION_MS = 250;
const CLAUDE_MAX_AGE_SECONDS = 60;
const FLOAT_TOP = 6;

export type OpenReason = 'hover' | 'click' | 'key';
export type Placement = 'bar' | 'float';

export interface IslandDependencies {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly feed: ActivityFeed;
    readonly recording: Recording;
    readonly sessions: ClaudeSessions;
    readonly media: MediaService;
}

export interface IslandEvents {
    opening: [];
    opened: [];
    closed: [];
    tabRequested: [TabId];
}

export class Island extends Emitter<IslandEvents> {
    readonly pill: Pill;
    readonly panel = new St.Bin({style_class: 'frodo-panel', reactive: true, track_hover: true, visible: false});
    readonly monitorIndex: number;

    readonly #settings: FrodoSettings;
    readonly #state: SystemState;
    readonly #claude: ClaudeService;
    readonly #feed: ActivityFeed;
    readonly #grab = new GrabHelper(this.panel, {actionMode: Shell.ActionMode.POPUP});
    readonly #openTimer = new Timer();
    readonly #closeTimer = new Timer();
    readonly #disposables = new Disposables();
    #placement: Placement | null = null;
    #dateMenu: Clutter.Actor | null = null;
    #fullscreen = false;
    #isOpen = false;
    #openedBy: OpenReason | null = null;
    #holds = 0;

    constructor(dependencies: IslandDependencies, monitorIndex: number) {
        super();
        const {settings, state, claude, feed} = dependencies;
        this.#settings = settings;
        this.#state = state;
        this.#claude = claude;
        this.#feed = feed;
        this.monitorIndex = monitorIndex;
        this.pill = new Pill({
            ...dependencies,
            actions: {
                openTab: tab => {
                    this.openTab(tab);
                },
            },
        });
        Main.layoutManager.addTopChrome(this.panel, {affectsStruts: false});

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
            pill.connect('notify::width', () => {
                this.#positionFloating();
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('button-press-event', (_actor, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY && !this.pill.activate()) this.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('button-release-event', () => Clutter.EVENT_STOP),
        );
        this.#disposables.signal(
            this.panel,
            this.panel.connect('notify::width', () => {
                this.#recenterPanel();
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
        this.#disposables.add(
            onFullscreenStateChanged(() => {
                this.#syncFullscreen();
            }),
        );
        this.#syncMemoryNeed();
    }

    get isOpen(): boolean {
        return this.#isOpen;
    }

    setPlacement(placement: Placement): void {
        if (placement === this.#placement) return;
        this.#detach();
        this.pill.setBar(placement === 'bar');
        if (placement === 'bar') this.#attachToBar();
        else this.#attachFloating();
        this.#syncFullscreen();
    }

    setContent(content: Clutter.Actor | null): void {
        this.panel.set_child(content);
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
        if (this.#isOpen || this.#fullscreen) return;
        this.#openTimer.stop();
        this.#feed.cancelTransient();
        this.#isOpen = true;
        this.#openedBy = reason;
        this.pill.actor.reactive = false;
        this.#claude.refreshIfStale(CLAUDE_MAX_AGE_SECONDS);

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
        if (reason !== 'hover') this.#onPanelHover();
        this.emit('opened');
    }

    openTab(tab: TabId): void {
        this.close();
        this.emit('tabRequested', tab);
        this.open('key');
    }

    close(animate = true): void {
        if (!this.#isOpen) return;
        this.#isOpen = false;
        this.#openedBy = null;
        this.pill.actor.reactive = true;
        this.#openTimer.stop();
        this.#closeTimer.stop();
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});
        this.emit('closed');

        if (animate) this.#animateClose();
        else this.#snapClosed();
    }

    #animateClose(): void {
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
    }

    #snapClosed(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        const {scaleX, scaleY} = this.#collapsedScale();
        panel.remove_all_transitions();
        pill.remove_all_transitions();
        panel.set({opacity: 0, scale_x: scaleX, scale_y: scaleY});
        panel.hide();
        pill.opacity = 255;
    }

    #monitor(): {x: number; y: number; width: number} | null {
        return Main.layoutManager.monitors[this.monitorIndex] ?? null;
    }

    #attachToBar(): void {
        const pill = this.pill.actor;
        const center = panelCenterBox();
        this.#dateMenu = dateMenuContainer();
        const index = this.#dateMenu ? center.get_children().indexOf(this.#dateMenu) : -1;
        this.#dateMenu?.hide();
        pill.fixed_position_set = false;
        pill.y_align = Clutter.ActorAlign.FILL;
        center.insert_child_at_index(pill, Math.max(0, index));
        this.#placement = 'bar';
    }

    #attachFloating(): void {
        Main.layoutManager.addTopChrome(this.pill.actor, {affectsStruts: false});
        this.#placement = 'float';
        this.#positionFloating();
    }

    #detach(): void {
        const pill = this.pill.actor;
        const placement = this.#placement;
        this.#placement = null;
        if (placement === 'bar') {
            pill.get_parent()?.remove_child(pill);
            if (sessionPanelHas('dateMenu')) this.#dateMenu?.show();
            this.#dateMenu = null;
        } else if (placement === 'float') {
            Main.layoutManager.removeChrome(pill);
        }
    }

    #flushPendingRelayout(): void {
        this.pill.actor.get_allocation_box();
    }

    #release(): void {
        const placement = this.#placement;
        this.#placement = null;
        if (placement === 'float') Main.layoutManager.untrackChrome(this.pill.actor);
        if (placement === 'bar' && sessionPanelHas('dateMenu')) this.#dateMenu?.show();
        this.#dateMenu = null;
    }

    #positionFloating(): void {
        const monitor = this.#monitor();
        if (this.#placement !== 'float' || !monitor) return;
        const pill = this.pill.actor;
        pill.set_position(Math.round(monitor.x + (monitor.width - pill.width) / 2), monitor.y + FLOAT_TOP);
    }

    #syncFullscreen(): void {
        this.#fullscreen = this.#placement === 'float' && hasRealFullscreen(this.monitorIndex);
        this.pill.actor.visible = !this.#fullscreen;
        if (this.#fullscreen) {
            this.#feed.cancelTransient();
            this.close();
        }
    }

    #animateOpen(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        panel.remove_all_transitions();
        panel.opacity = 0;
        panel.show();

        const [pillX, pillY] = pill.get_transformed_position();
        const [, naturalWidth] = panel.get_preferred_width(-1);
        const monitor = this.#monitor();
        if (monitor) panel.set_position(centerClamp(pillX, pill.width, naturalWidth, monitor.x, monitor.width), Math.round(pillY));
        panel.set_pivot_point((pillX + pill.width / 2 - panel.x) / Math.max(1, naturalWidth), 0);

        const collapsed = this.#collapsedScale();
        panel.scale_x = collapsed.scaleX;
        panel.scale_y = collapsed.scaleY;
        panel.ease({opacity: 255, scaleX: 1, scaleY: 1, duration: ANIMATION_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        pill.ease({opacity: 0, duration: ANIMATION_MS / 2, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    #recenterPanel(): void {
        const monitor = this.#monitor();
        if (!this.#isOpen || !monitor) return;
        const pill = this.pill.actor;
        const [pillX] = pill.get_transformed_position();
        this.panel.x = centerClamp(pillX, pill.width, this.panel.width, monitor.x, monitor.width);
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
        this.#state.setMemoryWanted(this.pill.wantsMemory);
    }

    #onPillHover(): void {
        if (this.#isOpen) return;
        if (this.pill.actor.hover && this.#settings.openOnHover && !this.pill.hasAction)
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
        else if (this.#settings.autoClose)
            this.#closeTimer.once(AUTO_CLOSE_MS, () => {
                this.close();
            });
    }

    destroy(): void {
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});
        if (this.#isOpen) {
            this.#isOpen = false;
            this.emit('closed');
        }
        this.#openTimer.stop();
        this.#closeTimer.stop();
        this.#disposables.dispose();
        this.clearListeners();
        this.#flushPendingRelayout();
        this.#release();
        Main.layoutManager.untrackChrome(this.panel);
        this.panel.set_child(null);
        this.pill.destroy();
        this.panel.destroy();
    }
}
