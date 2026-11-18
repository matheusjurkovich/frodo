import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {ellipsize, formatClock, formatSpan, formatTimer, formatUntil, secondsSince} from '../shared/format.js';
import {clamp} from '../shared/geometry.js';
import {iconButton, textButton} from '../shared/ui/buttons.js';
import {frodoIcon} from '../shared/ui/icons.js';
import {column, label} from '../shared/ui/layout.js';
import {PROVIDER_ICONS} from '../shared/ui/provider-tile.const.js';
import {SegmentBar} from '../shared/ui/segment-bar.js';
import {PROVIDER_NAMES} from '../shared/ai-provider.const.js';
import {alertTitle} from '../features/github/github.js';
import type {PillActivity} from './activity-feed.types.js';
import {
    APP_CHARS,
    ARTIST_CHARS,
    MINUTE_TICK_SECONDS,
    REPO_CHARS,
    STEP_CHARS,
    TICK_SECONDS,
    TITLE_CHARS,
    TRACK_CHARS,
} from './activity-rows.const.js';
import type {ActivityRow} from './activity-rows.types.js';
import type {ActivityServices, Of} from './activity-view.types.js';
import {Avatar} from './avatar.js';
import {FAULT_TABS, FAULT_TARGETS, FAULT_TEXTS} from './fault.const.js';
import {volumeLevel} from './volume-level.js';

function icon(gicon: Gio.Icon, styleClass = ''): St.Icon {
    return new St.Icon({gicon, style_class: `frodo-pill-icon ${styleClass}`.trim(), y_align: Clutter.ActorAlign.CENTER});
}

function row(children: Clutter.Actor[], extra: Partial<ActivityRow> = {}): ActivityRow {
    return {children, hasAction: false, clickTab: null, clickTarget: null, tick: null, refresh: null, ...extra};
}

function recordingRow({startedAt}: Of<'recording'>, services: ActivityServices): ActivityRow {
    const elapsed = label('', 'frodo-pill-detail frodo-mono');
    const stop = textButton(
        'Parar',
        () => {
            services.recording.stop();
        },
        'danger',
        frodoIcon('stop'),
    );
    return row(
        [
            new St.Widget({style_class: 'frodo-pill-dot', y_align: Clutter.ActorAlign.CENTER}),
            label('Gravando', 'frodo-pill-title'),
            elapsed,
            stop,
        ],
        {
            hasAction: true,
            tick: {
                seconds: TICK_SECONDS,
                update: () => {
                    elapsed.text = formatTimer(secondsSince(startedAt, Date.now()));
                },
            },
        },
    );
}

function permissionRow({session, request}: Of<'claude-permission'>, services: ActivityServices): ActivityRow {
    return row(
        [
            icon(frodoIcon(PROVIDER_ICONS[session.provider]), 'frodo-pill-icon-waiting'),
            label(`${ellipsize(session.repo, REPO_CHARS)} precisa de permissão`, 'frodo-pill-title'),
            label(ellipsize(request.tool, STEP_CHARS), 'frodo-pill-detail'),
            textButton('Negar', () => {
                services.sessions.decide(request, 'deny');
            }),
            textButton(
                'Aprovar',
                () => {
                    services.sessions.decide(request, 'allow');
                },
                'primary',
            ),
        ],
        {hasAction: true},
    );
}

function decisionRow({decided}: Of<'decision'>): ActivityRow {
    const {request, session, decision} = decided;
    const allowed = decision === 'allow';
    const detail = allowed
        ? `${request.summary} rodando${session ? ` no ${session.repo}` : ''}`
        : `o ${session ? PROVIDER_NAMES[session.provider] : 'a IA'} vai propor outro caminho`;
    const text = column('frodo-pill-decision-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(label(allowed ? 'Permitido uma vez' : 'Negado', 'frodo-pill-title'));
    text.add_child(label(ellipsize(detail, STEP_CHARS), 'frodo-pill-detail'));
    return row([icon(frodoIcon('check'), 'frodo-pill-decision-icon'), text], {clickTab: 'claude'});
}

function waitingRow({session}: Of<'claude-waiting'>, services: ActivityServices): ActivityRow {
    const children: Clutter.Actor[] = [
        icon(frodoIcon(PROVIDER_ICONS[session.provider]), 'frodo-pill-icon-waiting'),
        label(`${ellipsize(session.repo, REPO_CHARS)} precisa de permissão`, 'frodo-pill-title'),
    ];
    if (session.step !== '') children.push(label(ellipsize(session.step, STEP_CHARS), 'frodo-pill-detail frodo-mono'));
    children.push(
        textButton(
            'Abrir',
            () => {
                if (!services.sessions.focus(session.sessionId)) services.actions.openTab('claude');
            },
            'primary',
        ),
    );
    return row(children, {hasAction: true});
}

function meetingRow({title, startsAt, url}: Of<'meeting'>, services: ActivityServices): ActivityRow {
    const until = label('', 'frodo-pill-detail');
    const join =
        url === null
            ? textButton(
                  'Abrir',
                  () => {
                      services.actions.openTab('calendar');
                  },
                  'primary',
              )
            : textButton(
                  'Entrar',
                  () => {
                      Gio.AppInfo.launch_default_for_uri(url, null);
                  },
                  'primary',
              );
    return row([icon(frodoIcon('calendar')), label(ellipsize(title, TITLE_CHARS), 'frodo-pill-title'), until, join], {
        hasAction: true,
        tick: {
            seconds: MINUTE_TICK_SECONDS,
            update: () => {
                until.text = formatUntil(startsAt, Date.now());
            },
        },
    });
}

function faultRow({fault}: Of<'fault'>): ActivityRow {
    const clock = label('', 'frodo-pill-detail frodo-pill-fault-clock frodo-mono');
    return row(
        [
            new St.Widget({style_class: 'frodo-pill-fault-dot', y_align: Clutter.ActorAlign.CENTER}),
            clock,
            label(FAULT_TEXTS[fault], 'frodo-pill-title frodo-pill-fault-text'),
        ],
        {
            clickTab: FAULT_TABS[fault],
            clickTarget: FAULT_TARGETS[fault] ?? null,
            tick: {
                seconds: MINUTE_TICK_SECONDS,
                update: () => {
                    clock.text = formatClock();
                },
            },
        },
    );
}

function notificationRow({item}: Of<'notification'>): ActivityRow {
    const app = item.app === '' ? 'agora' : `${ellipsize(item.app, APP_CHARS)} · agora`;
    const body = item.body.replace(/\s+/g, ' ').trim();
    const text = column('frodo-pill-notification-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(label(app, 'frodo-pill-detail'));
    text.add_child(label(item.title, 'frodo-pill-notification-title'));
    if (body !== '') text.add_child(label(body, 'frodo-pill-notification-body'));
    return row([new Avatar(item.gicon ?? frodoIcon('info')).actor, text], {clickTab: 'notifications'});
}

function volumeRow({percent}: Of<'volume'>): ActivityRow {
    const bar = new SegmentBar('frodo-pill-volume');
    const glyph = icon(Gio.ThemedIcon.new(`audio-volume-${volumeLevel(percent)}-symbolic`));
    const value = label('', 'frodo-pill-percent frodo-mono');
    let level = volumeLevel(percent);
    const apply = (next: number): void => {
        bar.segments = [{fraction: clamp(next / 100, 0, 1), styleClass: ''}];
        value.text = `${next}%`;
        const nextLevel = volumeLevel(next);
        if (nextLevel === level) return;
        level = nextLevel;
        glyph.gicon = Gio.ThemedIcon.new(`audio-volume-${level}-symbolic`);
    };
    apply(percent);
    return row([glyph, bar.actor, value], {
        refresh: activity => {
            if (activity.kind === 'volume') apply(activity.percent);
        },
    });
}

function workingRow({session}: Of<'claude-working'>): ActivityRow {
    const span = label('', 'frodo-pill-span frodo-mono');
    const children = [
        icon(frodoIcon(PROVIDER_ICONS[session.provider]), `frodo-pill-icon-${session.provider}`),
        label(ellipsize(session.repo, REPO_CHARS), 'frodo-pill-title frodo-mono'),
    ];
    if (session.step !== '') children.push(label(ellipsize(session.step, STEP_CHARS), 'frodo-pill-detail frodo-mono'));
    children.push(span);
    return row(children, {
        clickTab: 'claude',
        tick: {
            seconds: MINUTE_TICK_SECONDS,
            update: () => {
                span.text = formatSpan(secondsSince(session.since, Date.now()));
            },
        },
    });
}

function mediaRow({track}: Of<'media'>, services: ActivityServices): ActivityRow {
    const cover =
        track.coverUrl === ''
            ? icon(frodoIcon('music'))
            : new St.Widget({
                  style_class: 'frodo-pill-cover',
                  style: `background-image: url(${JSON.stringify(track.coverUrl)});`,
                  y_align: Clutter.ActorAlign.CENTER,
              });
    const children = [cover, label(ellipsize(track.title, TRACK_CHARS), 'frodo-pill-title')];
    if (track.artist !== '') children.push(label(ellipsize(track.artist, ARTIST_CHARS), 'frodo-pill-detail'));
    children.push(
        icon(frodoIcon('wave'), 'frodo-pill-icon-wave'),
        iconButton(
            frodoIcon('pause'),
            'Pausar',
            () => {
                services.media.playPause();
            },
            'light',
            32,
        ),
    );
    return row(children, {hasAction: true});
}

function githubRow({pr, more}: Of<'github'>, services: ActivityServices): ActivityRow {
    const text = column('frodo-pill-github-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(label(ellipsize(alertTitle(pr), TITLE_CHARS), 'frodo-pill-title'));
    const files = `${String(pr.files)} ${pr.files === 1 ? 'arquivo' : 'arquivos'}`;
    const extra = more > 0 ? ` · +${String(more)}` : '';
    text.add_child(
        label(ellipsize(`${files} · ${pr.head} → ${pr.base}${extra}`, TITLE_CHARS), 'frodo-pill-detail frodo-pill-github-detail'),
    );
    const open = textButton(
        'Ver',
        () => {
            services.github.focus(pr.key);
            services.actions.openTab('github');
        },
        'primary',
    );
    return row([icon(frodoIcon(`pr-${pr.kind}`), `frodo-pill-github-icon frodo-github-kind-${pr.kind}`), text, open], {
        hasAction: true,
        clickTab: 'github',
    });
}

export function buildRow(activity: PillActivity, services: ActivityServices): ActivityRow {
    switch (activity.kind) {
        case 'recording':
            return recordingRow(activity, services);
        case 'claude-permission':
            return permissionRow(activity, services);
        case 'claude-waiting':
            return waitingRow(activity, services);
        case 'decision':
            return decisionRow(activity);
        case 'fault':
            return faultRow(activity);
        case 'meeting':
            return meetingRow(activity, services);
        case 'notification':
            return notificationRow(activity);
        case 'github':
            return githubRow(activity, services);
        case 'volume':
            return volumeRow(activity);
        case 'claude-working':
            return workingRow(activity);
        case 'media':
            return mediaRow(activity, services);
    }
}
