import type {PillActivity} from './activity-feed.js';

export function sameSubject(a: PillActivity | null, b: PillActivity | null): boolean {
    if (a === null || b === null) return a === b;
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
        case 'recording':
        case 'volume':
            return true;
        case 'claude-waiting':
        case 'claude-working':
            return b.kind === a.kind && a.session.sessionId === b.session.sessionId;
        case 'claude-permission':
            return b.kind === a.kind && a.session.sessionId === b.session.sessionId && a.request.key === b.request.key;
        case 'meeting':
            return b.kind === a.kind && a.title === b.title && a.startsAt === b.startsAt;
        case 'notification':
            return b.kind === a.kind && a.item === b.item;
        case 'media':
            return b.kind === a.kind && a.track.title === b.track.title && a.track.artist === b.track.artist && a.track.app === b.track.app;
    }
}
