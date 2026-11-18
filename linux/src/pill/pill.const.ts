import type {Decision} from '../features/claude/claude-sessions.types.js';
import type {FaultTone} from './fault.types.js';
import type {ActivityKind} from './activity-priority.types.js';

export const STATE_CLASSES: Partial<Record<ActivityKind, string>> = {
    recording: 'frodo-pill-recording',
    'claude-permission': 'frodo-pill-waiting',
    'claude-waiting': 'frodo-pill-waiting',
    meeting: 'frodo-pill-meeting',
    notification: 'frodo-pill-notification',
    github: 'frodo-pill-github',
};

export const FAULT_CLASSES: Record<FaultTone, string> = {
    danger: 'frodo-pill-fault-danger',
    warn: 'frodo-pill-fault-warn',
};

export const DECISION_CLASSES: Record<Decision, string> = {
    allow: 'frodo-pill-decision-allow',
    deny: 'frodo-pill-decision-deny',
};
