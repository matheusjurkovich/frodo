import Clutter from 'gi://Clutter';
import {hasMaximizedWindow, hasRealFullscreen, onWindowCoverChanged} from '../shared/shell-internals.js';
import {Disposables} from '../shared/disposables.js';
import {nextPeek} from '../shared/peek.js';
import {SOFT_SPRING, SPRING} from '../shared/spring.const.js';
import {Timer} from '../shared/timer.js';
import {springEase} from '../shared/ui/motion.js';
import {pillCover, tongueVisible} from './island-cover.js';
import {FADE_IN_MS} from './island-presence.const.js';
import type {IslandPresenceDependencies} from './island-presence.types.js';

export class IslandPresence {
    readonly #dependencies: IslandPresenceDependencies;
    readonly #peekTimer = new Timer();
    readonly #disposables = new Disposables();
    #covered = false;
    #fullscreen = false;
    #peeking = false;
    #pillWanted = true;
    #edge: string | null = null;

    constructor(dependencies: IslandPresenceDependencies) {
        this.#dependencies = dependencies;
        const {settings, feed, tongue} = dependencies;
        tongue.connect('destroy', () => {
            this.#disposables.dispose();
        });
        this.#disposables.add(
            onWindowCoverChanged(() => {
                this.sync();
            }),
        );
        this.#disposables.add(
            feed.on('changed', () => {
                this.sync();
            }),
        );
        this.#disposables.add(
            settings.onChanged('always-show-pill', () => {
                this.sync();
            }),
        );
        this.#disposables.add(
            settings.onChanged(['peek-clock', 'peek-every-minutes', 'peek-seconds'], () => {
                if (!this.#peeking) this.#peekTimer.stop();
                this.#schedulePeek();
            }),
        );
        this.#disposables.add(() => {
            this.#peekTimer.stop();
        });
    }

    get covered(): boolean {
        return this.#covered;
    }

    sync(): void {
        const {settings, feed, monitorIndex} = this.#dependencies;
        const fullscreen = hasRealFullscreen(monitorIndex);
        const alwaysShowPill = settings.alwaysShowPill;
        const maximized = !fullscreen && !alwaysShowPill && hasMaximizedWindow(monitorIndex);
        const {covered, pillWanted} = pillCover({fullscreen, maximized, alwaysShowPill, kind: feed.current?.kind, peeking: this.#peeking});
        const entering = covered && !this.#covered;
        this.#covered = covered;
        this.#fullscreen = fullscreen;
        this.#schedulePeek();
        this.#showPill(pillWanted, !fullscreen && !this.#dependencies.isOpen());
        if (entering) {
            feed.cancelTransient();
            this.#dependencies.close();
        }
        this.syncTongue();
    }

    syncTongue(): void {
        const {tongue, placement, pill} = this.#dependencies;
        const visible = tongueVisible({
            covered: this.#covered,
            fullscreen: this.#fullscreen,
            open: this.#dependencies.isOpen(),
            pillVisible: pill.actor.visible,
        });
        if (tongue.visible !== visible) tongue.set({visible, hover: false});
        const edge = placement.tongueEdge;
        if (edge !== this.#edge) {
            if (this.#edge) tongue.remove_style_class_name(`frodo-tongue-${this.#edge}`);
            tongue.add_style_class_name(`frodo-tongue-${edge}`);
            this.#edge = edge;
        }
        if (!tongue.visible) return;
        const origin = placement.tongueOrigin(tongue.width, tongue.height);
        if (origin) tongue.set_position(origin.x, origin.y);
    }

    finishConceal(): void {
        const pill = this.#dependencies.pill.actor;
        if (this.#pillWanted || !pill.visible) return;
        pill.remove_all_transitions();
        pill.set_size(-1, -1);
        pill.hide();
        pill.opacity = 255;
        this.syncTongue();
    }

    destroy(): void {
        this.#disposables.dispose();
    }

    #schedulePeek(): void {
        const {settings} = this.#dependencies;
        if (!this.#fullscreen || !settings.peekClock) {
            this.#peekTimer.stop();
            this.#endPeek();
            return;
        }
        if (this.#peeking || this.#peekTimer.active) return;
        const now = new Date();
        this.#peekTimer.once(nextPeek(now, settings.peekEveryMinutes).getTime() - now.getTime(), () => {
            this.#startPeek();
        });
    }

    #startPeek(): void {
        if (this.#pillWanted || this.#dependencies.isOpen()) {
            this.#schedulePeek();
            return;
        }
        const seconds = this.#dependencies.settings.peekSeconds;
        this.#peeking = true;
        this.#dependencies.pill.setPeek(seconds);
        this.finishConceal();
        this.#showPill(true, true);
        this.syncTongue();
        this.#peekTimer.once(seconds * 1000, () => {
            this.#endPeek();
            this.#schedulePeek();
        });
    }

    #endPeek(): void {
        if (!this.#peeking) return;
        this.#peeking = false;
        if (this.#fullscreen) this.#showPill(false, !this.#dependencies.isOpen());
        else this.#dependencies.pill.setPeek(null);
    }

    #showPill(wanted: boolean, animate: boolean): void {
        if (wanted && !this.#peeking) this.#dependencies.pill.setPeek(null);
        if (wanted === this.#pillWanted) return;
        this.#pillWanted = wanted;
        const pill = this.#dependencies.pill.actor;
        if (!animate) {
            pill.visible = wanted;
            return;
        }
        const tongue = this.#dependencies.tongue;
        const [, tongueWidth] = tongue.get_preferred_width(-1);
        const [, tongueHeight] = tongue.get_preferred_height(tongueWidth);
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
                    this.syncTongue();
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
}
