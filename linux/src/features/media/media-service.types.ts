import type GLib from 'gi://GLib';
import type {TrackMetadata} from './media.types.js';

export interface PlayerApp {
    readonly Identity: string | null;
}

export interface PlayerControls {
    readonly PlaybackStatus: string | null;
    readonly Metadata: Record<string, GLib.Variant> | null;
    readonly CanGoNext: boolean | null;
    readonly CanGoPrevious: boolean | null;
    PlayPauseAsync(): Promise<unknown>;
    NextAsync(): Promise<unknown>;
    PreviousAsync(): Promise<unknown>;
}

export interface MediaTrack extends TrackMetadata {
    readonly app: string;
    readonly playing: boolean;
    readonly canPrevious: boolean;
    readonly canNext: boolean;
}
