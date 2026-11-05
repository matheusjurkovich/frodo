import type {ClaudeService} from '../features/claude/claude-service.js';
import type {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../features/claude/claude-transcripts-service.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import type {MediaService} from '../features/media/media-service.js';
import type {UpcomingMeeting} from '../features/meetings/meetings-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {PerformanceMonitor} from '../features/system/performance-service.js';
import type {Recording} from '../features/system/recording-service.js';
import type {SystemState} from '../features/system/system-state-service.js';
import type {VolumeWatch} from '../features/system/volume-service.js';
import type {Workspaces} from '../features/workspaces/workspaces-service.js';
import type {ActivityFeed} from '../pill/activity-feed.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';

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
