import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {ellipsize, formatSpan, formatTimer, formatUntil, secondsSince} from '../shared/format.js';
import type {TabId} from '../settings/schema-values.js';
import type {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import type {MediaService} from '../features/media/media-service.js';
import type {Recording} from '../features/system/recording-service.js';
import {Timer} from '../shared/timer.js';
import {iconButton, textButton} from '../shared/ui/buttons.js';
import {column, label} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.js';
import {SegmentBar} from '../shared/ui/segment-bar.js';
import {frodoIcon} from '../shared/ui/icons.js';
import {setSourceColor} from '../shared/ui/progress-ring.js';
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
    readonly sessions: Pick<ClaudeSessions, 'focus' | 'decide'>;
    readonly media: Pick<MediaService, 'playPause'>;
    readonly actions: PillActions;
}

function icon(gicon: Gio.Icon, styleClass = ''): St.Icon {
    return new St.Icon({gicon, style_class: `frodo-pill-icon ${styleClass}`.trim(), y_align: Clutter.ActorAlign.CENTER});
}

function avatar(gicon: Gio.Icon): St.Widget {
    const box = new St.Widget({
        style_class: 'frodo-pill-avatar',
        layout_manager: new Clutter.BinLayout(),
        y_align: Clutter.ActorAlign.CENTER,
    });
    const corners = new St.DrawingArea({style_class: 'frodo-pill-avatar-corners', x_expand: true, y_expand: true});
    corners.connect('repaint', () => {
        const cr = corners.get_context();
        const node = corners.get_theme_node();
        const [w, h] = corners.get_surface_size();
        const r = Math.min(node.get_border_radius(St.Corner.TOPLEFT), w / 2, h / 2);
        cr.rectangle(0, 0, w, h);
        cr.moveTo(r, 0);
        cr.arcNegative(r, r, r, -Math.PI / 2, Math.PI);
        cr.lineTo(0, h - r);
        cr.arcNegative(r, h - r, r, Math.PI, Math.PI / 2);
        cr.lineTo(w - r, h);
        cr.arcNegative(w - r, h - r, r, Math.PI / 2, 0);
        cr.lineTo(w, r);
        cr.arcNegative(w - r, r, r, 0, -Math.PI / 2);
        cr.closePath();
        setSourceColor(cr, node.get_foreground_color());
        cr.fill();
        cr.$dispose();
    });
    box.add_child(new St.Icon({gicon, style_class: 'frodo-pill-avatar-icon'}));
    box.add_child(corners);
    return box;
}

function volumeIcon(percent: number): Gio.Icon {
    const level = percent <= 0 ? 'muted' : percent < 34 ? 'low' : percent < 67 ? 'medium' : 'high';
    return Gio.ThemedIcon.new(`audio-volume-${level}-symbolic`);
}

export class ActivityView implements Component {
    readonly actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});

    readonly #services: ActivityServices;
    readonly #ticker = new Timer();
    #content: St.BoxLayout | null = null;
    #clickTab: TabId | null = null;
    #hasAction = false;

    constructor(services: ActivityServices) {
        this.#services = services;
        this.actor.connect('destroy', () => {
            this.#ticker.stop();
        });
    }

    get hasAction(): boolean {
        return this.#hasAction;
    }

    get content(): St.BoxLayout | null {
        return this.#content;
    }

    activate(): boolean {
        if (this.#clickTab === null) return false;
        this.#services.actions.openTab(this.#clickTab);
        return true;
    }

    show(activity: PillActivity, bar: boolean): void {
        this.clear();
        this.#content = new St.BoxLayout({style_class: 'frodo-pill-content', x_expand: true});
        this.actor.add_child(this.#content);
        switch (activity.kind) {
            case 'recording':
                this.#recording(activity);
                break;
            case 'claude-permission':
                this.#permission(activity);
                break;
            case 'claude-waiting':
                this.#waiting(activity);
                break;
            case 'meeting':
                this.#meeting(activity);
                break;
            case 'notification':
                this.#notification(activity, bar);
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

    takeContent(): St.BoxLayout | null {
        const content = this.#content;
        this.#ticker.stop();
        this.#content = null;
        this.#clickTab = null;
        this.#hasAction = false;
        if (content) this.actor.remove_child(content);
        return content;
    }

    clear(): void {
        this.takeContent()?.destroy();
    }

    #add(...children: Clutter.Actor[]): void {
        for (const child of children) this.#content?.add_child(child);
    }

    #addAction(button: St.Button): void {
        this.#hasAction = true;
        this.#content?.add_child(button);
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

    #permission({session, request}: Of<'claude-permission'>): void {
        this.#add(
            icon(frodoIcon('claude'), 'frodo-pill-icon-waiting'),
            label(`${ellipsize(session.repo, REPO_CHARS)} precisa de permissão`, 'frodo-pill-title'),
            label(ellipsize(request.tool, STEP_CHARS), 'frodo-pill-detail'),
        );
        this.#addAction(
            textButton('Negar', () => {
                this.#services.sessions.decide(request, 'deny');
            }),
        );
        this.#addAction(
            textButton(
                'Aprovar',
                () => {
                    this.#services.sessions.decide(request, 'allow');
                },
                'primary',
            ),
        );
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

    #notification({item}: Of<'notification'>, bar: boolean): void {
        this.#clickTab = 'notifications';
        const app = item.app === '' ? 'agora' : `${ellipsize(item.app, APP_CHARS)} · agora`;
        const body = item.body.replace(/\s+/g, ' ').trim();
        const gicon = item.gicon ?? frodoIcon('info');
        if (bar) {
            this.#add(avatar(gicon), label(app, 'frodo-pill-detail'), label(ellipsize(item.title, TITLE_CHARS), 'frodo-pill-title'));
            if (body !== '') this.#add(label(ellipsize(body, BODY_CHARS), 'frodo-pill-detail'));
            return;
        }
        const text = column('frodo-pill-notification-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(label(app, 'frodo-pill-detail'));
        text.add_child(label(item.title, 'frodo-pill-notification-title'));
        if (body !== '') text.add_child(label(body, 'frodo-pill-notification-body'));
        this.#add(avatar(gicon), text);
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
        const cover =
            track.coverUrl === ''
                ? icon(frodoIcon('music'))
                : new St.Widget({
                      style_class: 'frodo-pill-cover',
                      style: `background-image: url(${JSON.stringify(track.coverUrl)});`,
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
