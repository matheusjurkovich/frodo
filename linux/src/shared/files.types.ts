import type Gio from 'gi://Gio';

export interface ListOptions {
    flags?: Gio.FileQueryInfoFlags;
    priority?: number;
    batch?: number;
    cancellable?: Gio.Cancellable | null;
}
