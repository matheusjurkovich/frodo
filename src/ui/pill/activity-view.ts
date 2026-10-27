import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {ellipsize, formatSpan, formatTimer, formatUntil, secondsSince} from '../../core/format.js';
import type {TabId} from '../../core/types.js';
import type {ClaudeSessions} from '../../services/claude-sessions.js';
import type {MediaService} from '../../services/media.js';
import type {Recording} from '../../services/recording.js';
import {Timer} from '../../util/timer.js';
import {iconButton, textButton} from '../components/buttons.js';
import {label} from '../components/layout.js';
import type {Component} from '../components/lifecycle.js';
import {SegmentBar} from '../components/segment-bar.js';
import {frodoIcon} from '../icons.js';
import type {PillActivity} from './activity-feed.js';

const TICK_SECONDS = 1;
const REPO_CHARS = 24;
const STEP_CHARS = 40;
const TITLE_CHARS = 40;
const BODY_CHARS = 40;
const APP_CHARS = 20;
const TRACK_CHARS = 30;
const ARTIST_CHARS = 24;

type Of<K extends PillActivity['kind']> = Extract<PillActivity, {kind: K}>;

export interface PillActions {
    openTab(tab: TabId): void;
}

export interface ActivityServices {
    readonly recording: Pick<Recording, 'stop'>;
    readonly sessions: Pick<ClaudeSessions, 'focus'>;
    readonly media: Pick<MediaService, 'playPause'>;
    readonly actions: PillActions;
}

function icon(gicon: Gio.Icon, styleClass = ''): St.Icon {
    return new St.Icon({gicon, style_class: `frodo-pill-icon ${styleClass}`.trim(), y_align: Clutter.ActorAlign.CENTER});
}

function volumeIcon(percent: number): Gio.Icon {
    const level = percent <= 0 ? 'muted' : percent < 34 ? 'low' : percent < 67 ? 'medium' : 'high';
    return Gio.ThemedIcon.new(`audio-volume-${level}-symbolic`);
}

export class ActivityView implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-pill-content'});

    readonly #services: ActivityServices;
    readonly #ticker = new Timer();
    #clickTab: TabId | null = null;
    #hasAction = false;

    constructor(services: ActivityServices) {
        this.#services = services;
    }

    get hasAction(): boolean {
        return this.#hasAction;
    }

    activate(): boolean {
        if (this.#clickTab === null) return false;
        this.#services.actions.openTab(this.#clickTab);
        return true;
    }

    show(activity: PillActivity): void {
        this.clear();
        switch (activity.kind) {
            case 'recording':
                this.#recording(activity);
                break;
            case 'claude-waiting':
                this.#waiting(activity);
                break;
            case 'meeting':
                this.#meeting(activity);
                break;
            case 'notification':
                this.#notification(activity);
                break;
            case 'volume':
                this.#volume(activity);
                break;
            case 'claude-working':
                this.#working(activity);
                break;
            case 'media':
                this.#media(activity);
                break;
        }
    }

    clear(): void {
        this.#ticker.stop();
        this.actor.destroy_all_children();
        this.#clickTab = null;
        this.#hasAction = false;
    }

    #add(...children: Clutter.Actor[]): void {
        for (const child of children) this.actor.add_child(child);
    }

    #addAction(button: St.Button): void {
        this.#hasAction = true;
        this.actor.add_child(button);
    }

    #tick(update: () => void): void {
        update();
        this.#ticker.every(TICK_SECONDS, update);
    }

    #recording({startedAt}: Of<'recording'>): void {
        const elapsed = label('', 'frodo-pill-detail frodo-mono');
        this.#add(
            new St.Widget({style_class: 'frodo-pill-dot', y_align: Clutter.ActorAlign.CENTER}),
            label('Gravando', 'frodo-pill-title'),
            elapsed,
        );
        this.#addAction(
            textButton(
                'Parar',
                () => {
                    this.#services.recording.stop();
                },
                'danger',
                frodoIcon('stop'),
            ),
        );
        this.#tick(() => {
            elapsed.text = formatTimer(secondsSince(startedAt, Date.now()));
        });
    }

    #waiting({session}: Of<'claude-waiting'>): void {
        this.#add(
            icon(frodoIcon('claude'), 'frodo-pill-icon-waiting'),
            label(`${ellipsize(session.repo, REPO_CHARS)} precisa de permissão`, 'frodo-pill-title'),
        );
        if (session.step !== '') this.#add(label(ellipsize(session.step, STEP_CHARS), 'frodo-pill-detail frodo-mono'));
        this.#addAction(
            textButton(
                'Abrir',
                () => {
                    if (!this.#services.sessions.focus(session.sessionId)) this.#services.actions.openTab('claude');
                },
                'primary',
            ),
        );
    }

    #meeting({title, startsAt}: Of<'meeting'>): void {
        const until = label('', 'frodo-pill-detail');
        this.#add(icon(frodoIcon('calendar')), label(ellipsize(title, TITLE_CHARS), 'frodo-pill-title'), until);
        this.#addAction(
            textButton(
                'Abrir',
                () => {
                    this.#services.actions.openTab('calendar');
                },
                'primary',
            ),
        );
        this.#tick(() => {
            until.text = formatUntil(startsAt, Date.now());
        });
    }

    #notification({item}: Of<'notification'>): void {
        this.#clickTab = 'notifications';
        const body = item.body.replace(/\s+/g, ' ').trim();
        this.#add(
            icon(item.gicon ?? frodoIcon('info')),
            label(item.app === '' ? 'agora' : `${ellipsize(item.app, APP_CHARS)} · agora`, 'frodo-pill-detail'),
            label(ellipsize(item.title, TITLE_CHARS), 'frodo-pill-title'),
        );
        if (body !== '') this.#add(label(ellipsize(body, BODY_CHARS), 'frodo-pill-detail'));
    }

    #volume({percent}: Of<'volume'>): void {
        const bar = new SegmentBar('frodo-pill-volume');
        bar.segments = [{fraction: Math.min(1, Math.max(0, percent / 100)), styleClass: ''}];
        this.#add(icon(volumeIcon(percent)), bar.actor, label(`${percent}%`, 'frodo-pill-percent frodo-mono'));
    }

    #working({session}: Of<'claude-working'>): void {
        this.#clickTab = 'claude';
        const span = label('', 'frodo-pill-span frodo-mono');
        this.#add(
            icon(frodoIcon('claude'), 'frodo-pill-icon-claude'),
            label(ellipsize(session.repo, REPO_CHARS), 'frodo-pill-title frodo-mono'),
        );
        if (session.step !== '') this.#add(label(ellipsize(session.step, STEP_CHARS), 'frodo-pill-detail frodo-mono'));
        this.#add(span);
        this.#tick(() => {
            span.text = formatSpan(secondsSince(session.since, Date.now()));
        });
    }

    #media({track}: Of<'media'>): void {
        const cover = new St.Icon({
            gicon: track.coverUrl === '' ? frodoIcon('music') : Gio.FileIcon.new(Gio.File.new_for_uri(track.coverUrl)),
            style_class: 'frodo-pill-cover',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#add(cover, label(ellipsize(track.title, TRACK_CHARS), 'frodo-pill-title'));
        if (track.artist !== '') this.#add(label(ellipsize(track.artist, ARTIST_CHARS), 'frodo-pill-detail'));
        this.#add(icon(frodoIcon('wave'), 'frodo-pill-icon-wave'));
        this.#addAction(
            iconButton(
                frodoIcon('pause'),
                'Pausar',
                () => {
                    this.#services.media.playPause();
                },
                'light',
                32,
            ),
        );
    }

    destroy(): void {
        this.#ticker.stop();
        this.actor.destroy();
    }
}
