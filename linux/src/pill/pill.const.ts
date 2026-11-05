import type {ActivityKind} from './activity-priority.types.js';

export const STATE_CLASSES: Partial<Record<ActivityKind, string>> = {
    recording: 'frodo-pill-recording',
    'claude-permission': 'frodo-pill-waiting',
    'claude-waiting': 'frodo-pill-waiting',
    meeting: 'frodo-pill-meeting',
    notification: 'frodo-pill-notification',
};
