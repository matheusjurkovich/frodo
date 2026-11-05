export interface TrackMetadata {
    readonly title: string;
    readonly artist: string;
    readonly album: string;
    readonly coverUrl: string;
    readonly lengthUs: number | null;
}

export interface PlayerCandidate {
    readonly name: string;
    readonly playing: boolean;
    readonly title: string;
}
