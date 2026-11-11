import Clutter from 'gi://Clutter';
import GnomeDesktop from 'gi://GnomeDesktop';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {Disposables} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {closedItemsFor, isTextItem, rotatingItems} from './closed-items.js';
import {createSegment, itemText} from './idle-segments.js';
import type {IdleViewDependencies, Segment, SegmentContext} from './idle-view.types.js';
import {RotatingSlot} from './rotating-slot.js';

export class IdleView extends Emitter<{rebuilt: []}> implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-pill-content'});

    readonly #deps: IdleViewDependencies;
    readonly #clock = new GnomeDesktop.WallClock();
    readonly #disposables = new Disposables();
    readonly #built = new Disposables();
    readonly #rotateTimer = this.#disposables.own(new Timer());
    readonly #context: SegmentContext;
    #segments: Segment[] = [];
    #slot: RotatingSlot | null = null;
    #vertical = false;

    constructor(deps: IdleViewDependencies) {
        super();
        this.#deps = deps;
        const {settings, state, claude, codex, gemini, bridge} = deps;
        this.#context = {
            ...deps,
            built: this.#built,
            refresh: () => {
                this.#update();
            },
            rebuild: () => {
                this.#build();
            },
        };
        const refresh = this.#context.refresh;

        this.#disposables.signal(this.#clock, this.#clock.connect('notify::clock', refresh));
        this.#disposables.signal(
            this.actor,
            this.actor.connect('notify::mapped', () => {
                this.#syncRotation();
            }),
        );
        this.#disposables.add(
            settings.onChanged(['closed-mode', 'closed-items', 'rotate-seconds'], () => {
                this.#build();
            }),
        );
        this.#disposables.add(settings.onChanged(['disabled-ai', 'claude-show-remaining', 'ram-percent'], refresh));
        this.#disposables.add(claude.on('changed', refresh));
        this.#disposables.add(codex.on('changed', refresh));
        this.#disposables.add(gemini.on('changed', refresh));
        this.#disposables.add(bridge.on('changed', refresh));
        for (const event of ['memory', 'battery'] as const) this.#disposables.add(state.on(event, refresh));
        this.#build();
    }

    setVertical(vertical: boolean): void {
        if (vertical === this.#vertical) return;
        this.#vertical = vertical;
        this.actor.orientation = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        this.#build();
    }

    get wantsMemory(): boolean {
        return this.#deps.settings.closedMode !== 'minimal' && this.#deps.settings.closedItems.includes('ram');
    }

    #build(): void {
        const {settings} = this.#deps;
        this.#rotateTimer.stop();
        this.#built.dispose();
        this.actor.destroy_all_children();
        this.#segments = [];
        this.#slot = null;

        const rotating = settings.closedMode === 'rotating';
        for (const item of closedItemsFor(settings.closedMode, settings.closedItems)) {
            const segment = rotating && isTextItem(item) ? this.#rotatingSegment() : createSegment(item, this.#context);
            if (this.#vertical) segment.actor.x_align = Clutter.ActorAlign.CENTER;
            if (this.#vertical && segment.actor instanceof St.Label) segment.actor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this.actor.add_child(segment.actor);
            this.#segments.push(segment);
        }
        this.#syncRotation();
        this.#update();
        this.emit('rebuilt');
    }

    #rotatingSegment(): Segment {
        const {settings, state} = this.#deps;
        const slot = new RotatingSlot(
            () =>
                rotatingItems(settings.closedItems, {
                    hasBattery: state.battery !== null,
                    providerEnabled: provider => settings.providerEnabled(provider),
                }),
            item => itemText(item, this.#context),
        );
        this.#slot = slot;
        return {
            actor: slot.actor,
            isVisible: () => slot.isVisible(),
            update: () => {
                slot.update();
            },
        };
    }

    #syncRotation(): void {
        this.#rotateTimer.stop();
        const slot = this.#slot;
        if (!slot || !this.actor.mapped) return;
        this.#rotateTimer.every(this.#deps.settings.rotateSeconds, () => {
            slot.advance();
        });
    }

    #update(): void {
        for (const segment of this.#segments) {
            const visible = segment.isVisible();
            segment.actor.visible = visible;
            if (visible) segment.update();
        }
    }

    destroy(): void {
        this.#built.dispose();
        this.#disposables.dispose();
        this.clearListeners();
        this.actor.destroy();
    }
}
