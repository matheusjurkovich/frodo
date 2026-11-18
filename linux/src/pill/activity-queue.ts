import type {PillActivity} from './activity-feed.types.js';
import {OVERLAY_KINDS, QUEUE_NAMES} from './activity-queue.const.js';

export function queued(unseen: readonly PillActivity[], current: PillActivity | null): PillActivity[] {
    return unseen.filter(activity => activity !== current && !OVERLAY_KINDS.includes(activity.kind));
}

function name(activity: PillActivity): string {
    switch (activity.kind) {
        case 'notification':
        case 'volume':
        case 'decision':
            return '';
        case 'recording':
            return QUEUE_NAMES.recording(activity);
        case 'claude-permission':
            return QUEUE_NAMES['claude-permission'](activity);
        case 'claude-waiting':
            return QUEUE_NAMES['claude-waiting'](activity);
        case 'meeting':
            return QUEUE_NAMES.meeting(activity);
        case 'github':
            return QUEUE_NAMES.github(activity);
        case 'media':
            return QUEUE_NAMES.media(activity);
        case 'claude-working':
            return QUEUE_NAMES['claude-working'](activity);
    }
}

export function queueLabel(items: readonly PillActivity[]): string {
    return `Mais ${items.length} na fila: ${items.map(name).join(', ')}`;
}
