import St from 'gi://St';

import type {ActivityKind} from '../../core/pill-activity.js';
import type {ClaudeService} from '../../services/claude-service.js';
import type {NotificationBridge} from '../../services/notification-bridge.js';
import type {FrodoSettings} from '../../services/settings.js';
import type {SystemState} from '../../services/system-state.js';
import {Disposables} from '../../util/disposables.js';
import {Emitter} from '../../util/emitter.js';
import type {ActivityFeed} from './activity-feed.js';
import {ActivityView} from './activity-view.js';
import type {ActivityServices} from './activity-view.js';
import {IdleView} from './idle-view.js';

const STATE_CLASSES: Partial<Record<ActivityKind, string>> = {
    recording: 'frodo-pill-recording',
    'claude-waiting': 'frodo-pill-waiting',
    meeting: 'frodo-pill-meeting',
};

export interface PillDependencies extends ActivityServices {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly bridge: NotificationBridge;
    readonly feed: ActivityFeed;
}

export class Pill extends Emitter<{rebuilt: []}> {
    readonly actor = new St.BoxLayout({style_class: 'frodo-pill', reactive: true, track_hover: true});

    readonly #feed: ActivityFeed;
    readonly #idle: IdleView;
    readonly #activity: ActivityView;
    readonly #disposables = new Disposables();
    #bar = false;

    constructor({settings, state, claude, bridge, feed, recording, sessions, media, actions}: PillDependencies) {
        super();
        this.#feed = feed;
        this.#idle = new IdleView(settings, state, claude, bridge);
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
        this.#sync();
    }

    get wantsMemory(): boolean {
        return this.#idle.wantsMemory;
    }

    get hasAction(): boolean {
        return this.#activity.hasAction;
    }

    setBar(bar: boolean): void {
        this.#bar = bar;
        this.#syncStyle();
    }

    activate(): boolean {
        return this.#activity.activate();
    }

    #sync(): void {
        const activity = this.#feed.current;
        this.#idle.actor.visible = activity === null;
        this.#activity.actor.visible = activity !== null;
        if (activity) this.#activity.show(activity);
        else this.#activity.clear();
        this.#syncStyle();
    }

    #syncStyle(): void {
        const kind = this.#feed.current?.kind;
        const classes = ['frodo-pill'];
        if (this.#bar) classes.push('frodo-pill-bar');
        const state = kind === undefined ? undefined : STATE_CLASSES[kind];
        if (state) classes.push(state);
        if (this.#activity.hasAction) classes.push('frodo-pill-action');
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
