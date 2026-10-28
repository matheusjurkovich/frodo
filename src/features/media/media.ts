export interface TrackMetadata {
    readonly title: string;
    readonly artist: string;
    readonly coverUrl: string;
    readonly lengthUs: number | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function artists(value: unknown): string {
    if (Array.isArray(value)) return value.filter((artist): artist is string => typeof artist === 'string').join(', ');
    return text(value);
}

export function parseMetadata(metadata: Record<string, unknown>): TrackMetadata {
    const length = metadata['mpris:length'];
    return {
        title: text(metadata['xesam:title']),
        artist: artists(metadata['xesam:artist']),
        coverUrl: text(metadata['mpris:artUrl']),
        lengthUs: typeof length === 'number' && Number.isFinite(length) && length > 0 ? length : null,
    };
}

export function trackFraction(positionUs: number | null, lengthUs: number | null): number | null {
    if (positionUs === null || lengthUs === null || lengthUs <= 0) return null;
    return Math.min(1, Math.max(0, positionUs / lengthUs));
}

const PLAYERCTLD = 'org.mpris.MediaPlayer2.playerctld';

export interface PlayerCandidate {
    readonly name: string;
    readonly playing: boolean;
    readonly title: string;
}

export function pickPlayer<Candidate extends PlayerCandidate>(players: readonly Candidate[]): Candidate | null {
    const candidates = players.filter(player => player.name !== PLAYERCTLD);
    return candidates.find(player => player.playing) ?? candidates.findLast(player => player.title !== '') ?? null;
}
