import type Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ClaudeService} from '../features/claude/claude-service.js';
import {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import {DoneAlert} from '../features/claude/done-alert-service.js';
import {ClaudeTranscripts} from '../features/claude/claude-transcripts-service.js';
import {CodexUsage} from '../features/codex/codex-service.js';
import {GeminiUsage} from '../features/gemini/gemini-service.js';
import {MediaService} from '../features/media/media-service.js';
import {UpcomingMeeting} from '../features/meetings/meetings-service.js';
import {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import {MemoryAlert} from '../features/system/memory-alert-service.js';
import {PerformanceMonitor} from '../features/system/performance-service.js';
import {Recording} from '../features/system/recording-service.js';
import {SystemState} from '../features/system/system-state-service.js';
import {VolumeWatch} from '../features/system/volume-service.js';
import {Workspaces} from '../features/workspaces/workspaces-service.js';
import {ActivityFeed} from '../pill/activity-feed.js';
import {FrodoSettings} from '../settings/frodo-settings.js';
import type {Disposables} from '../shared/disposables.js';

export interface FrodoServices {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly transcripts: ClaudeTranscripts;
    readonly sessions: ClaudeSessions;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly media: MediaService;
    readonly workspaces: Workspaces;
    readonly bridge: NotificationBridge;
    readonly recording: Recording;
    readonly volume: VolumeWatch;
    readonly meetings: UpcomingMeeting;
    readonly performance: PerformanceMonitor;
    readonly feed: ActivityFeed;
}

export function createServices(gsettings: Gio.Settings, disposables: Disposables): FrodoServices {
    const settings = new FrodoSettings(gsettings);
    const state = disposables.own(new SystemState());
    const claude = disposables.own(new ClaudeService(settings));
    const transcripts = disposables.own(new ClaudeTranscripts(settings));
    const sessions = disposables.own(
        new ClaudeSessions(settings, undefined, window => {
            Main.activateWindow(window);
        }),
    );
    const codex = disposables.own(new CodexUsage(settings));
    const gemini = disposables.own(new GeminiUsage(settings));
    const media = disposables.own(new MediaService());
    const workspaces = disposables.own(new Workspaces());
    const bridge = disposables.own(new NotificationBridge());
    const recording = disposables.own(new Recording());
    const volume = disposables.own(new VolumeWatch());
    const meetings = disposables.own(new UpcomingMeeting(settings));
    const performance = disposables.own(new PerformanceMonitor());
    disposables.own(new MemoryAlert());
    disposables.own(new DoneAlert(settings, sessions));
    const feed = disposables.own(new ActivityFeed({recording, sessions, meetings, bridge, volume, media, settings}));
    return {
        settings,
        state,
        claude,
        transcripts,
        sessions,
        codex,
        gemini,
        media,
        workspaces,
        bridge,
        recording,
        volume,
        meetings,
        performance,
        feed,
    };
}
