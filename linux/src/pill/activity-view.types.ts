import type {TabId} from '../settings/schema-values.types.js';
import type {ClaudeSessions} from '../features/claude/claude-sessions-service.js';
import type {MediaService} from '../features/media/media-service.js';
import type {Recording} from '../features/system/recording-service.js';
import type {PillActivity} from './activity-feed.types.js';

export type Of<K extends PillActivity['kind']> = Extract<PillActivity, {kind: K}>;

export interface PillActions {
    openTab(tab: TabId): void;
}

export interface ActivityServices {
    readonly recording: Pick<Recording, 'stop'>;
    readonly sessions: Pick<ClaudeSessions, 'focus' | 'decide'>;
    readonly media: Pick<MediaService, 'playPause'>;
    readonly actions: PillActions;
}
