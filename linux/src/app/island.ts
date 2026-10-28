import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {alignX, centerClamp, topEdgeSpan} from '../shared/geometry.js';
import {SURFACE_STYLES} from '../settings/schema-values.js';
import type {TabId} from '../settings/schema-values.js';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';
import {
    dateMenuContainer,
    hasMaximizedWindow,
    hasRealFullscreen,
    onWindowCoverChanged,
    panelBox,
    sessionPanelHas,
    watchTopEdge,
} from '../shared/shell-internals.js';
import {Disposables} from '../shared/disposables.js';
import type {Disposer} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import type {IslandHandle} from '../shared/island-handle.js';
import type {FrodoServices} from './services.js';
import {GENTLE_SPRING, SOFT_SPRING, SPRING, springWithin} from '../shared/spring.js';
import {Timer} from '../shared/timer.js';
import {Glass} from '../shared/ui/glass.js';
import {settle, springEase} from '../shared/ui/motion.js';
import type {ActivityFeed} from '../pill/activity-feed.js';
import {Pill} from '../pill/pill.js';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 300;
const AUTO_CLOSE_MS = 5000;
const FADE_IN_MS = 220;
const FADE_IN_DELAY_MS = 70;
const FADE_OUT_MS = 110;
const FOLLOW = 'frodo-follow';
const BLUR = 'frodo-blur';
const BLUR_RADIUS = 16;
const BLUR_IN_MS = 300;
const CLOSE_FADE_MS = 160;
const CONTENT_OPEN_SCALE = 0.9;
const CONTENT_CLOSE_SCALE = 0.95;
const CLAUDE_MAX_AGE_SECONDS = 60;
const FLOAT_TOP = 6;
const FLOAT_EDGE = 8;
const EDGE_SPAN = 900;
const EDGE_GRACE_MS = 1500;

export type OpenReason = 'hover' | 'click' | 'key';

function pressedButton(event: Clutter.Event, root: Clutter.Actor): boolean {
    for (let actor: Clutter.Actor | null = global.stage.get_event_actor(event); actor && actor !== root; actor = actor.get_parent())
        if (actor instanceof St.Button) return true;
    return false;
}
export type Placement = 'bar' | 'float';

export interface IslandEvents {
    opening: [];
    closed: [];
    tabRequested: [TabId];
}

export class Island extends Emitter<IslandEvents> implements IslandHandle {
    readonly pill: Pill;
    readonly panel = new St.Bin({style_class: 'frodo-panel', reactive: true, track_hover: true, visible: false});
    readonly #backdrop = new St.Widget({style_class: 'frodo-panel-backdrop', visible: false});
    readonly #tongue = new St.Widget({style_class: 'frodo-tongue', reactive: true, track_hover: true, visible: false});
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
    #covered = false;
    #unredirectDisabled = false;
    #pillWanted = true;
    #clipping = false;
    #isOpen = false;
    #openedBy: OpenReason | null = null;
    #holds = 0;
    #recenterLater = 0;
    #backdropGlass: Glass | null = null;
    #pillGlass: Glass | null = null;
    #edgeWatch: Disposer | null = null;

    constructor(dependencies: FrodoServices, monitorIndex: number) {
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
        Main.layoutManager.addTopChrome(this.#backdrop, {affectsStruts: false});
        Main.layoutManager.addTopChrome(this.panel, {affectsStruts: false});
        Main.layoutManager.addTopChrome(this.#tongue, {affectsStruts: false});

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
            pill.connect('notify::allocation', () => {
                this.#queueRecenter();
            }),
        );
        this.#disposables.add(() => {
            if (this.#recenterLater !== 0) global.compositor.get_laters().remove(this.#recenterLater);
            this.#recenterLater = 0;
        });
        this.#disposables.signal(
            pill,
            pill.connect('button-press-event', (_actor, event) => {
                if (pressedButton(event, pill)) return Clutter.EVENT_PROPAGATE;
                if (event.get_button() === Clutter.BUTTON_PRIMARY && !this.pill.activate()) this.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.#disposables.signal(
            pill,
            pill.connect('button-release-event', (_actor, event) =>
                pressedButton(event, pill) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP,
            ),
        );
        this.#disposables.signal(
            this.#tongue,
            this.#tongue.connect('notify::hover', () => {
                this.#onTongueHover();
            }),
        );
        this.#disposables.signal(
            this.#tongue,
            this.#tongue.connect('button-press-event', () => {
                this.open('click');
                return Clutter.EVENT_STOP;
            }),
        );
        this.#watchTopEdge();
        this.#disposables.add(() => {
            this.#edgeWatch?.();
            this.#edgeWatch = null;
        });
        this.#disposables.add(
            settings.onChanged('pill-position', () => {
                this.#syncPosition();
            }),
        );
        this.#disposables.signal(
            this.#backdrop,
            this.#backdrop.connect('notify::allocation', () => {
                if (this.#clipping) this.#clipToBackdrop();
            }),
        );
        this.#disposables.signal(
            this.panel,
            this.panel.connect('notify::scale-x', () => {
                if (this.#clipping) this.#clipToBackdrop();
            }),
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
            onWindowCoverChanged(() => {
                this.#syncCovered();
            }),
        );
        this.#disposables.add(
            this.#feed.on('changed', () => {
                this.#syncCovered();
            }),
        );
        this.#disposables.signal(
            global.display,
            global.display.connect('workareas-changed', () => {
                if (this.#isOpen) this.#capHeight(this.panel.y);
            }),
        );
        this.#disposables.add(
            settings.onChanged('surface-style', () => {
                this.#syncSurface();
            }),
        );
        this.#disposables.add(() => {
            this.#dropGlass();
        });
        this.#syncSurface();
        this.#syncMemoryNeed();
    }

    #syncSurface(): void {
        const style = this.#settings.surfaceStyle;
        const backdrop = this.#backdrop;
        for (const other of SURFACE_STYLES) backdrop.remove_style_class_name(`frodo-surface-${other}`);
        if (style === 'solid') {
            this.#dropGlass();
            return;
        }
        backdrop.add_style_class_name(`frodo-surface-${style}`);
        this.#backdropGlass ??= new Glass(backdrop);
        if (this.#placement === 'float') this.#pillGlass ??= new Glass(this.pill.actor);
    }

    #dropGlass(): void {
        this.#backdropGlass?.destroy();
        this.#backdropGlass = null;
        this.#pillGlass?.destroy();
        this.#pillGlass = null;
    }

    setPlacement(placement: Placement): void {
        if (placement === this.#placement) return;
        this.#detach();
        this.pill.setBar(placement === 'bar');
        if (placement === 'bar') this.#attachToBar();
        else this.#attachFloating();
        this.#syncSurface();
        this.#syncCovered();
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
        if (this.#isOpen) return;
        const tab = reason === 'hover' ? this.pill.clickTab : null;
        if (tab) this.emit('tabRequested', tab);
        this.#openTimer.stop();
        this.#feed.cancelTransient();
        this.#finishConceal();
        this.#isOpen = true;
        this.#openedBy = reason;
        this.pill.actor.set({reactive: false, hover: false});
        this.#claude.refreshIfStale(CLAUDE_MAX_AGE_SECONDS);

        this.emit('opening');
        this.#animateOpen();
        this.#syncTongue();
        if (reason !== 'hover') this.#takeGrab(this.panel);
    }

    grabKeyboard(focus: Clutter.Actor): void {
        if (!this.#isOpen) return;
        if (this.#grab.isActorGrabbed(this.panel)) {
            focus.grab_key_focus();
            return;
        }
        this.#openedBy = 'click';
        this.#takeGrab(focus);
    }

    #takeGrab(focus: Clutter.Actor): void {
        this.#grab.grab({
            actor: this.panel,
            focus,
            onUngrab: () => {
                this.close();
            },
        });
        this.#onPanelHover();
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
        this.pill.actor.set({reactive: true, hover: false});
        this.#feed.cancelTransient();
        this.#openTimer.stop();
        this.#closeTimer.stop();
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});
        this.#syncTongue();
        this.emit('closed');

        if (animate) this.#animateClose();
        else this.#snapClosed();
    }

    #animateClose(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        const backdrop = this.#backdrop;
        const anchor = this.#anchor();
        anchor.get_allocation_box();
        const [anchorX, anchorY] = anchor.get_transformed_position();
        this.#pinBackdrop();
        panel.set_pivot_point((anchorX + anchor.width / 2 - panel.x) / Math.max(1, panel.width), 0);
        this.#clipping = true;
        this.#clipToBackdrop();
        this.#blurPanel(0, BLUR_RADIUS, CLOSE_FADE_MS);
        springEase(panel, {scaleX: CONTENT_CLOSE_SCALE, scaleY: CONTENT_CLOSE_SCALE}, SOFT_SPRING);
        panel.ease({opacity: 0, duration: CLOSE_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        springEase(backdrop, {x: anchorX, y: anchorY, width: anchor.width, height: anchor.height}, SOFT_SPRING, () => {
            backdrop.hide();
            panel.hide();
            panel.remove_clip();
            panel.remove_effect_by_name(BLUR);
            settle(panel);
            panel.opacity = 0;
            this.#clipping = false;
        });
        pill.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    #snapClosed(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        const backdrop = this.#backdrop;
        panel.remove_all_transitions();
        pill.remove_transition('opacity');
        backdrop.remove_all_transitions();
        backdrop.remove_constraint_by_name(FOLLOW);
        backdrop.hide();
        this.#clipping = false;
        panel.remove_clip();
        panel.remove_effect_by_name(BLUR);
        panel.set_scale(1, 1);
        panel.opacity = 0;
        panel.hide();
        pill.opacity = 255;
    }

    #blurPanel(from: number, to: number, duration: number): void {
        const {panel} = this;
        const current = panel.get_effect(BLUR);
        const effect = current instanceof Shell.BlurEffect ? current : new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, brightness: 1});
        if (effect !== current) panel.add_effect_with_name(BLUR, effect);
        effect.radius = from;
        panel.ease_property(`@effects.${BLUR}.radius`, to, {
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (to === 0) panel.remove_effect_by_name(BLUR);
            },
        });
    }

    #pinBackdrop(): void {
        const backdrop = this.#backdrop;
        if (!backdrop.get_constraint(FOLLOW)) return;
        const {x, y, width, height} = this.panel;
        backdrop.remove_constraint_by_name(FOLLOW);
        backdrop.set_position(x, y);
        backdrop.set_size(width, height);
    }

    #clipToBackdrop(): void {
        const {panel} = this;
        const backdrop = this.#backdrop;
        const [, preferred] = panel.get_preferred_width(-1);
        const width = Math.max(1, panel.allocation.get_width() || preferred);
        const scale = Math.max(0.01, panel.scale_x);
        const pivotX = panel.pivot_point.x * width;
        panel.set_clip(
            pivotX + (backdrop.x - panel.x - pivotX) / scale,
            (backdrop.y - panel.y) / scale,
            backdrop.width / scale,
            backdrop.height / scale,
        );
    }

    #monitor(): {x: number; y: number; width: number} | null {
        return Main.layoutManager.monitors[this.monitorIndex] ?? null;
    }

    #anchor(): Clutter.Actor {
        return this.pill.actor.visible ? this.pill.actor : this.#tongue;
    }

    #watchTopEdge(): void {
        this.#edgeWatch?.();
        this.#edgeWatch = null;
        const {monitors} = Main.layoutManager;
        const monitor = monitors[this.monitorIndex];
        const span = monitor ? topEdgeSpan(monitor, monitors, EDGE_SPAN, this.#settings.pillPosition) : null;
        if (!span) return;
        this.#edgeWatch = watchTopEdge(span, () => {
            if (this.#isOpen || this.#covered || this.pill.hasAction || !this.#settings.openOnHover) return;
            this.open('hover');
            this.#closeTimer.once(EDGE_GRACE_MS, () => {
                if (!this.panel.hover && this.#holds === 0) this.close();
            });
        });
    }

    #syncPosition(): void {
        if (this.#placement === 'bar') {
            this.#detach();
            this.#attachToBar();
        }
        this.#positionFloating();
        this.#watchTopEdge();
        this.#syncTongue();
    }

    #syncTongue(): void {
        const tongue = this.#tongue;
        const visible = this.#covered && !this.#isOpen && !this.pill.actor.visible;
        if (tongue.visible !== visible) tongue.set({visible, hover: false});
        const monitor = this.#monitor();
        if (tongue.visible && monitor)
            tongue.set_position(alignX(this.#settings.pillPosition, tongue.width, monitor.x, monitor.width, FLOAT_EDGE), monitor.y);
    }

    #attachToBar(): void {
        const pill = this.pill.actor;
        const position = this.#settings.pillPosition;
        const center = panelBox('center');
        this.#dateMenu = dateMenuContainer();
        const index = this.#dateMenu ? center.get_children().indexOf(this.#dateMenu) : -1;
        this.#dateMenu?.hide();
        pill.fixed_position_set = false;
        pill.y_align = Clutter.ActorAlign.FILL;
        if (position === 'left') panelBox('left').add_child(pill);
        else if (position === 'right') panelBox('right').insert_child_at_index(pill, 0);
        else center.insert_child_at_index(pill, Math.max(0, index));
        this.#placement = 'bar';
    }

    #attachFloating(): void {
        Main.layoutManager.addTopChrome(this.pill.actor, {affectsStruts: false});
        this.#placement = 'float';
        this.#positionFloating();
    }

    #detach(): void {
        this.#pillGlass?.destroy();
        this.#pillGlass = null;
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
        this.panel.get_allocation_box();
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
        pill.set_position(alignX(this.#settings.pillPosition, pill.width, monitor.x, monitor.width, FLOAT_EDGE), monitor.y + FLOAT_TOP);
    }

    #syncCovered(): void {
        const fullscreen = hasRealFullscreen(this.monitorIndex);
        const covered = fullscreen || (this.#placement === 'float' && hasMaximizedWindow(this.monitorIndex));
        const kind = this.#feed.current?.kind;
        const alert = !fullscreen && (kind === 'notification' || kind === 'claude-permission');
        const entering = covered && !this.#covered;
        this.#covered = covered;
        this.#showPill(!covered || alert, !fullscreen && this.#placement === 'float' && !this.#isOpen);
        this.#syncUnredirect();
        if (entering) {
            this.#feed.cancelTransient();
            this.close();
        }
        this.#syncTongue();
    }

    #finishConceal(): void {
        const pill = this.pill.actor;
        if (this.#pillWanted || !pill.visible) return;
        pill.remove_all_transitions();
        pill.set_size(-1, -1);
        pill.hide();
        pill.opacity = 255;
        this.#syncTongue();
    }

    #showPill(wanted: boolean, animate: boolean): void {
        if (wanted === this.#pillWanted) return;
        this.#pillWanted = wanted;
        const pill = this.pill.actor;
        if (!animate) {
            pill.visible = wanted;
            return;
        }
        const [, tongueWidth] = this.#tongue.get_preferred_width(-1);
        const [, tongueHeight] = this.#tongue.get_preferred_height(tongueWidth);
        if (!wanted) {
            springEase(pill, {width: tongueWidth, height: tongueHeight}, SOFT_SPRING);
            pill.ease({
                opacity: 0,
                duration: SOFT_SPRING.ms,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    pill.remove_all_transitions();
                    pill.set_size(-1, -1);
                    pill.hide();
                    pill.opacity = 255;
                    this.#syncTongue();
                },
            });
            return;
        }
        const shown = pill.visible;
        const fromWidth = shown ? pill.width : tongueWidth;
        const fromHeight = shown ? pill.height : tongueHeight;
        pill.remove_all_transitions();
        pill.set_size(-1, -1);
        pill.show();
        const [, width] = pill.get_preferred_width(-1);
        const [, height] = pill.get_preferred_height(width);
        pill.set_size(fromWidth, fromHeight);
        if (!shown) pill.opacity = 0;
        springEase(pill, {width, height}, SPRING, () => {
            pill.set_size(-1, -1);
        });
        pill.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    #syncUnredirect(): void {
        const disable = this.#covered || this.#placement === 'float';
        if (disable === this.#unredirectDisabled) return;
        this.#unredirectDisabled = disable;
        if (disable) global.compositor.disable_unredirect();
        else global.compositor.enable_unredirect();
    }

    #animateOpen(): void {
        const {panel} = this;
        const pill = this.pill.actor;
        const backdrop = this.#backdrop;
        const anchor = this.#anchor();
        anchor.get_allocation_box();
        panel.remove_all_transitions();
        panel.opacity = 0;
        panel.show();

        const [anchorX, anchorY] = anchor.get_transformed_position();
        this.#capHeight(Math.round(anchorY));
        const [, naturalWidth] = panel.get_preferred_width(-1);
        const monitor = this.#monitor();
        if (monitor) panel.set_position(centerClamp(anchorX, anchor.width, naturalWidth, monitor.x, monitor.width), Math.round(anchorY));
        const area = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);
        const max = area.y + area.height - panel.y;
        const [, naturalHeight] = panel.get_preferred_height(naturalWidth);
        const height = Math.min(naturalHeight, max);
        panel.set_pivot_point((anchorX + anchor.width / 2 - panel.x) / Math.max(1, naturalWidth), 0);

        this.#pinBackdrop();
        if (!backdrop.visible) {
            backdrop.set_position(anchorX, anchorY);
            backdrop.set_size(anchor.width, anchor.height);
            backdrop.show();
        }
        panel.set_scale(CONTENT_OPEN_SCALE, CONTENT_OPEN_SCALE);
        this.#clipping = true;
        this.#clipToBackdrop();
        springEase(panel, {scaleX: 1, scaleY: 1, delay: FADE_IN_DELAY_MS}, SOFT_SPRING);
        this.#blurPanel(BLUR_RADIUS, 0, BLUR_IN_MS);
        springEase(backdrop, {x: panel.x, width: naturalWidth}, GENTLE_SPRING);
        springEase(backdrop, {y: panel.y, height}, springWithin(GENTLE_SPRING, backdrop.height, height, max), () => {
            this.#clipping = false;
            panel.remove_clip();
            backdrop.add_constraint_with_name(FOLLOW, new Clutter.BindConstraint({source: panel, coordinate: Clutter.BindCoordinate.ALL}));
        });
        panel.ease({opacity: 255, duration: FADE_IN_MS, delay: FADE_IN_DELAY_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        pill.ease({opacity: 0, duration: FADE_OUT_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    #capHeight(top: number): void {
        const area = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex);
        const content = this.panel.get_theme_node().adjust_for_height(area.y + area.height - top);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const height = Math.floor(content / scale);
        if (Number.isFinite(height)) this.panel.style = `max-height: ${Math.max(0, height)}px;`;
    }

    #queueRecenter(): void {
        if (!this.#isOpen || this.#recenterLater !== 0) return;
        this.#recenterLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.#recenterLater = 0;
            this.#recenterPanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    #recenterPanel(): void {
        const monitor = this.#monitor();
        if (!this.#isOpen || !monitor) return;
        const anchor = this.#anchor();
        const [anchorX] = anchor.get_transformed_position();
        this.panel.x = centerClamp(anchorX, anchor.width, this.panel.width, monitor.x, monitor.width);
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

    #onTongueHover(): void {
        if (this.#isOpen) return;
        if (this.#tongue.hover && this.#settings.openOnHover)
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
        this.panel.set_child(null);
        this.#flushPendingRelayout();
        this.#release();
        this.#covered = false;
        this.#syncUnredirect();
        Main.layoutManager.untrackChrome(this.panel);
        Main.layoutManager.removeChrome(this.#tongue);
        Main.layoutManager.removeChrome(this.#backdrop);
        this.#backdrop.destroy();
        this.#tongue.destroy();
        this.pill.destroy();
        this.panel.destroy();
    }
}
