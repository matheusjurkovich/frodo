import type Gio from 'gi://Gio';

export interface WatchHandlers {
    readonly read: (file: Gio.File, atMs: number) => Promise<boolean>;
    readonly forget: (file: Gio.File) => boolean;
    readonly onChanged: () => void;
}
