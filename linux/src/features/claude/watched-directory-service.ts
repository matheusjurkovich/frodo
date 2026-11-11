import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {listDirectory, modifiedMs} from '../../shared/files.js';
import {BATCH} from './watched-directory-service.const.js';
import type {WatchHandlers} from './watched-directory-service.types.js';

export class WatchedDirectory {
    readonly #directory: Gio.File;
    readonly #handlers: WatchHandlers;
    readonly #cancellable = new Gio.Cancellable();
    readonly #monitor: Gio.FileMonitor;
    readonly #monitorId: number;
    readonly ready: Promise<void>;
    #queue: Promise<void> = Promise.resolve();
    #destroyed = false;

    constructor(path: string, handlers: WatchHandlers) {
        this.#directory = Gio.File.new_for_path(path);
        this.#handlers = handlers;
        this.#monitor = this.#directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this.#cancellable);
        this.#monitorId = this.#monitor.connect('changed', (_monitor, file, other, type) => {
            this.#onEvent(file, other, type);
        });
        this.#enqueue(() => this.#load());
        this.ready = this.#queue;
    }

    #onEvent(file: Gio.File, other: Gio.File | null, type: Gio.FileMonitorEvent): void {
        switch (type) {
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
            case Gio.FileMonitorEvent.MOVED_IN:
                this.#enqueue(() => this.#handlers.read(file, Date.now()));
                break;
            case Gio.FileMonitorEvent.RENAMED:
                this.#enqueue(async () => {
                    const forgotten = this.#handlers.forget(file);
                    return (other !== null && (await this.#handlers.read(other, Date.now()))) || forgotten;
                });
                break;
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                this.#enqueue(() => Promise.resolve(this.#handlers.forget(file)));
                break;
        }
    }

    #enqueue(work: () => Promise<boolean>): void {
        this.#queue = this.#queue
            .then(async () => {
                if (!this.#destroyed && (await work())) this.#handlers.onChanged();
            })
            .catch((error: unknown) => {
                logError(error as object);
            });
    }

    async #load(): Promise<boolean> {
        const infos = await listDirectory(this.#directory.get_path() ?? '', 'standard::name,time::modified', {
            priority: GLib.PRIORITY_DEFAULT,
            batch: BATCH,
            cancellable: this.#cancellable,
        }).catch(() => []);
        for (const info of infos) await this.#handlers.read(this.#directory.get_child(info.get_name()), modifiedMs(info) || Date.now());
        return false;
    }

    destroy(): void {
        this.#destroyed = true;
        this.#cancellable.cancel();
        this.#monitor.disconnect(this.#monitorId);
        this.#monitor.cancel();
    }
}
