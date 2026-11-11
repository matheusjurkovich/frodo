import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {GrabHelper} from 'resource:///org/gnome/shell/ui/grabHelper.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {TabId} from '../settings/schema-values.types.js';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {SystemState} from '../features/system/system-state-service.js';
import {Disposables} from '../shared/disposables.js';
import type {Disposer} from '../shared/disposables.types.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';
import type {IslandHandle} from '../shared/island-handle.types.js';
import type {FrodoServices} from './services.types.js';
import type {ActivityFeed} from '../pill/activity-feed.js';
import {Pill} from '../pill/pill.js';
import {IslandMotion} from './island-motion.js';
import {IslandPlacement} from './island-placement.js';
import {IslandPointer} from './island-pointer.js';
import {IslandPresence} from './island-presence.js';
import {IslandSurface} from './island-surface.js';
import {CLAUDE_MAX_AGE_SECONDS, PREWARM_MS, PREWARM_OPACITY} from './island.const.js';
import type {IslandEvents, OpenReason} from './island.types.js';

export class Island extends Emitter<IslandEvents> implements IslandHandle {
    readonly pill: Pill;
    readonly panel = new St.Bin({style_class: 'frodo-panel', reactive: true, track_hover: true, visible: false});
    readonly overlay = new St.Widget({x_expand: true, y_expand: true});
    readonly #frame = new St.Widget({layout_manager: new Clutter.BinLayout()});
    #content: Clutter.Actor | null = null;
    readonly #backdrop = new St.Widget({style_class: 'frodo-panel-backdrop', visible: false});
    readonly #tongue = new St.Widget({style_class: 'frodo-tongue', reactive: true, track_hover: true, visible: false});
    readonly monitorIndex: number;

    readonly #state: SystemState;
    readonly #claude: ClaudeService;
    readonly #feed: ActivityFeed;
    readonly #grab = new GrabHelper(this.panel, {actionMode: Shell.ActionMode.POPUP});
    readonly #disposables = new Disposables();
    readonly #placement: IslandPlacement;
    readonly #motion: IslandMotion;
    readonly #pointer: IslandPointer;
    readonly #presence: IslandPresence;
    readonly #surface: IslandSurface;
    #isOpen = false;
    #openedBy: OpenReason | null = null;
    readonly #warmTimer = new Timer();
    #unwarm: Disposer | null = null;

    constructor(dependencies: FrodoServices, monitorIndex: number) {
        super();
        const {settings, state, claude, feed} = dependencies;
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
        this.#frame.add_child(this.overlay);
        this.panel.set_child(this.#frame);
        Main.layoutManager.addTopChrome(this.#backdrop, {affectsStruts: false});
        Main.layoutManager.addTopChrome(this.panel, {affectsStruts: false});
        Main.layoutManager.addTopChrome(this.#tongue, {affectsStruts: false});
        Main.layoutManager.addTopChrome(this.pill.actor, {affectsStruts: false});

        const placement = new IslandPlacement({
            settings,
            monitorIndex,
            monitors: () => Main.layoutManager.monitors,
            workArea: () => Main.layoutManager.getWorkAreaForMonitor(monitorIndex),
        });
        this.#placement = placement;
        const isOpen = (): boolean => this.#isOpen;
        const close = (): void => {
            this.close();
        };
        const pill = this.pill.actor;
        this.#disposables.add(
            this.pill.on('rebuilt', () => {
                this.#syncMemoryNeed();
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
            pill.connect('notify::height', () => {
                if (placement.bottom || placement.middle) this.#positionFloating();
            }),
        );
        this.#motion = this.#disposables.own(
            new IslandMotion({
                panel: this.panel,
                backdrop: this.#backdrop,
                pill,
                placement,
                anchor: () => this.#anchor(),
                isOpen,
            }),
        );
        this.#pointer = this.#disposables.own(
            new IslandPointer({
                pill: this.pill,
                panel: this.panel,
                tongue: this.#tongue,
                settings,
                placement,
                isOpen,
                openedBy: () => this.#openedBy,
                covered: () => this.#presence.covered,
                open: reason => {
                    this.open(reason);
                },
                close,
            }),
        );
        this.#presence = this.#disposables.own(
            new IslandPresence({
                pill: this.pill,
                tongue: this.#tongue,
                settings,
                feed,
                placement,
                monitorIndex,
                isOpen,
                close,
            }),
        );
        this.#disposables.add(
            settings.onChanged('pill-position', () => {
                this.#syncPosition();
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
        this.#disposables.signal(
            global.display,
            global.display.connect('workareas-changed', () => {
                this.#syncPosition();
                if (this.#isOpen) this.#motion.capHeight();
            }),
        );
        this.#surface = this.#disposables.own(
            new IslandSurface({
                settings,
                backdrop: this.#backdrop,
                panel: this.panel,
                tongue: this.#tongue,
                pill,
            }),
        );
        this.#surface.sync();
        this.#syncMemoryNeed();
        this.pill.setVertical(placement.middle);
        this.#positionFloating();
        this.#presence.sync();
        global.compositor.disable_unredirect();
    }

    setContent(content: Clutter.Actor | null): void {
        if (this.#content) this.#frame.remove_child(this.#content);
        this.#content = content;
        if (content) this.#frame.insert_child_below(content, this.overlay);
    }

    holdWhileOpen(menu: PopupMenu.PopupMenu): Disposer {
        return this.#pointer.hold(menu);
    }

    toggle(): void {
        if (this.#isOpen) this.close();
        else this.open('key');
    }

    prewarm(mapContent: () => Disposer): void {
        if (this.#isOpen || this.#unwarm || this.panel.visible) return;
        this.panel.set({opacity: PREWARM_OPACITY, reactive: false, x: global.stage.width, y: global.stage.height});
        this.panel.show();
        this.#unwarm = mapContent();
        this.#warmTimer.once(PREWARM_MS, () => {
            this.#endWarm();
        });
    }

    #endWarm(): void {
        const unwarm = this.#unwarm;
        if (!unwarm) return;
        this.#unwarm = null;
        this.#warmTimer.stop();
        unwarm();
        this.panel.reactive = true;
        this.panel.hide();
        this.panel.opacity = 0;
    }

    open(reason: OpenReason): void {
        if (this.#isOpen) return;
        this.#endWarm();
        const tab = reason === 'hover' ? this.pill.clickTab : null;
        if (tab) this.emit('tabRequested', tab);
        this.#pointer.cancelOpen();
        this.#feed.cancelTransient();
        this.#presence.finishConceal();
        this.#isOpen = true;
        this.#openedBy = reason;
        this.pill.actor.set({reactive: false, hover: false});
        this.#claude.refreshIfStale(CLAUDE_MAX_AGE_SECONDS);

        this.emit('opening');
        this.#motion.open();
        this.#presence.syncTongue();
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
        this.#pointer.syncPanel();
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
        this.#pointer.cancel();
        if (this.#grab.isActorGrabbed(this.panel)) this.#grab.ungrab({actor: this.panel});
        this.#presence.syncTongue();
        this.emit('closed');

        if (animate) this.#motion.close();
        else this.#motion.snapClosed();
    }

    #anchor(): Clutter.Actor {
        return this.pill.actor.visible ? this.pill.actor : this.#tongue;
    }

    #syncPosition(): void {
        this.pill.setVertical(this.#placement.middle);
        this.#positionFloating();
        this.#pointer.watchTopEdge();
        this.#presence.syncTongue();
    }

    #positionFloating(): void {
        const pill = this.pill.actor;
        const origin = this.#placement.floatingOrigin(pill.width, pill.height);
        if (origin) pill.set_position(origin.x, origin.y);
    }

    #flushPendingRelayout(): void {
        this.pill.actor.get_allocation_box();
        this.panel.get_allocation_box();
    }

    #syncMemoryNeed(): void {
        this.#state.setMemoryWanted(this.pill.wantsMemory);
    }

    destroy(): void {
        this.#warmTimer.stop();
        this.#unwarm = null;
        this.close(false);
        this.#disposables.dispose();
        this.clearListeners();
        this.panel.set_child(null);
        this.#flushPendingRelayout();
        Main.layoutManager.untrackChrome(this.pill.actor);
        global.compositor.enable_unredirect();
        Main.layoutManager.untrackChrome(this.panel);
        Main.layoutManager.removeChrome(this.#tongue);
        Main.layoutManager.removeChrome(this.#backdrop);
        this.#backdrop.destroy();
        this.#tongue.destroy();
        this.pill.destroy();
        this.panel.destroy();
    }
}
