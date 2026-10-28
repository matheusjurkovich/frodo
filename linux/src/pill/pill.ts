import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {ActivityKind} from './activity-priority.js';
import {sameSubject} from './activity-subject.js';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';
import type {TabId} from '../settings/schema-values.js';
import {Disposables} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import {SOFT_SPRING, SPRING} from '../shared/spring.js';
import {BOTH_AXES, WIDTH_AXIS, fadeIn, fadeOut, morphSize, settle} from '../shared/ui/motion.js';
import type {ActivityFeed, PillActivity} from './activity-feed.js';
import {ActivityView} from './activity-view.js';
import type {ActivityServices} from './activity-view.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import {IdleView} from './idle-view.js';

const STATE_CLASSES: Partial<Record<ActivityKind, string>> = {
    recording: 'frodo-pill-recording',
    'claude-permission': 'frodo-pill-waiting',
    'claude-waiting': 'frodo-pill-waiting',
    meeting: 'frodo-pill-meeting',
    notification: 'frodo-pill-notification',
};

function disarm(actor: Clutter.Actor): void {
    actor.reactive = false;
    for (const child of actor.get_children()) disarm(child);
}

export interface PillDependencies extends ActivityServices {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly bridge: NotificationBridge;
    readonly feed: ActivityFeed;
}

export class Pill extends Emitter<{rebuilt: []}> {
    readonly actor = new St.Widget({
        style_class: 'frodo-pill',
        layout_manager: new Clutter.BinLayout(),
        reactive: true,
        track_hover: true,
    });

    readonly #feed: ActivityFeed;
    readonly #settings: FrodoSettings;
    readonly #idle: IdleView;
    readonly #activity: ActivityView;
    readonly #disposables = new Disposables();
    #bar = false;
    #shown: PillActivity | null = null;

    constructor({settings, state, claude, codex, gemini, bridge, feed, recording, sessions, media, actions}: PillDependencies) {
        super();
        this.#feed = feed;
        this.#settings = settings;
        this.#idle = new IdleView({settings, state, claude, codex, gemini, bridge});
        this.#activity = new ActivityView({recording, sessions, media, actions});
        this.actor.add_child(this.#idle.actor);
        this.actor.add_child(this.#activity.actor);

        this.#disposables.add(
            this.#idle.on('rebuilt', () => {
                this.emit('rebuilt');
            }),
        );
        this.#disposables.add(
            feed.on('changed', () => {
                this.#sync();
            }),
        );
        this.#disposables.add(
            settings.onChanged('surface-style', () => {
                this.#syncStyle();
            }),
        );
        this.#sync();
    }

    get wantsMemory(): boolean {
        return this.#idle.wantsMemory;
    }

    get hasAction(): boolean {
        return this.#activity.hasAction;
    }

    get clickTab(): TabId | null {
        return this.#activity.clickTab;
    }

    setBar(bar: boolean): void {
        this.#bar = bar;
        this.#sync();
    }

    activate(): boolean {
        return this.#activity.activate();
    }

    #sync(): void {
        const next = this.#feed.current;
        const previous = this.#shown;
        this.#shown = next;
        const axes = this.#bar ? WIDTH_AXIS : BOTH_AXES;
        const apply = (): void => {
            this.#idle.actor.visible = next === null;
            if (next) this.#activity.show(next, this.#bar);
            else this.#activity.clear();
            this.#syncStyle();
        };
        if (sameSubject(previous, next)) {
            morphSize(this.actor, apply, SOFT_SPRING, axes);
            return;
        }
        const outgoing = previous === null ? this.#idle.actor : this.#activity.takeContent();
        morphSize(this.actor, apply, SPRING, axes);
        if (outgoing === this.#idle.actor) {
            outgoing.show();
            fadeOut(outgoing, () => {
                outgoing.hide();
                settle(outgoing);
            });
        } else if (outgoing) {
            disarm(outgoing);
            this.#activity.actor.insert_child_below(outgoing, null);
            fadeOut(outgoing, () => {
                outgoing.destroy();
            });
        }
        const incoming = next === null ? this.#idle.actor : this.#activity.content;
        if (incoming) fadeIn(incoming);
    }

    #syncStyle(): void {
        const kind = this.#feed.current?.kind;
        const classes = ['frodo-pill'];
        if (this.#bar) classes.push('frodo-pill-bar');
        const state = kind === undefined ? undefined : STATE_CLASSES[kind];
        if (state) classes.push(state);
        if (this.#activity.hasAction) classes.push('frodo-pill-action');
        const surface = this.#settings.surfaceStyle;
        if (surface !== 'solid') classes.push(`frodo-surface-${surface}`);
        this.actor.style_class = classes.join(' ');
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#idle.destroy();
        this.#activity.destroy();
        this.clearListeners();
        this.actor.destroy();
    }
}
