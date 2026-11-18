import type {DecidedRequest, PendingRequest, SessionState} from '../features/claude/claude-sessions.types.js';
import type {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import type {GitHubService} from '../features/github/github-service.js';
import type {ClassifiedPr} from '../features/github/github.types.js';
import type {MediaService} from '../features/media/media-service.js';
import type {MediaTrack} from '../features/media/media-service.types.js';
import type {UpcomingMeeting} from '../features/meetings/meetings-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {InterceptedNotification} from '../features/notifications/notification-bridge-service.types.js';
import type {Recording} from '../features/system/recording-service.js';
import type {VolumeWatch} from '../features/system/volume-service.js';
import type {Emitter} from '../shared/emitter.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {FaultKind} from './fault.types.js';

export type PillActivity =
    | {kind: 'recording'; startedAt: number}
    | {kind: 'claude-permission'; session: SessionState; request: PendingRequest}
    | {kind: 'claude-waiting'; session: SessionState}
    | {kind: 'decision'; decided: DecidedRequest}
    | {kind: 'fault'; fault: FaultKind; resting: boolean}
    | {kind: 'meeting'; title: string; startsAt: number; url: string | null}
    | {kind: 'notification'; item: InterceptedNotification}
    | {kind: 'github'; pr: ClassifiedPr; more: number}
    | {kind: 'volume'; percent: number}
    | {kind: 'claude-working'; session: SessionState}
    | {kind: 'media'; track: MediaTrack};

type FaultEmitter = Pick<Emitter<{changed: []}>, 'on'>;

export interface FeedFaults {
    readonly wifi: ({readonly failure: object | null} & FaultEmitter) | null;
    readonly calendar: ({readonly attention: object | null} & FaultEmitter) | null;
}

export interface FeedSources {
    readonly recording: Pick<Recording, 'startedAt' | 'on'>;
    readonly sessions: Pick<ClaudeSessions, 'sessions' | 'pending' | 'hookMissing' | 'on'>;
    readonly meetings: Pick<UpcomingMeeting, 'next' | 'on'>;
    readonly bridge: Pick<NotificationBridge, 'on'>;
    readonly volume: Pick<VolumeWatch, 'on'>;
    readonly media: Pick<MediaService, 'current' | 'on'>;
    readonly github: Pick<GitHubService, 'on' | 'status'>;
    readonly settings: Pick<FrodoSettings, 'pillAiActivity' | 'githubPill' | 'providerEnabled' | 'onChanged'>;
    readonly faults: FeedFaults;
}
