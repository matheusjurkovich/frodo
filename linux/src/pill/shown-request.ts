import type {PendingRequest} from '../features/claude/claude-sessions.types.js';
import type {PillActivity} from './activity-feed.types.js';

export function shownRequest(current: PillActivity | null): PendingRequest | null {
    return current?.kind === 'claude-permission' ? current.request : null;
}
