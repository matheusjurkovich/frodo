import type Gio from 'gi://Gio';
import {readTextFile} from '../../shared/files.js';
import {mergeEngines, parseDrmFdinfo} from './performance.js';
import type {DrmClient} from './performance.types.js';
import type {Engines} from './performance-service.types.js';
import {children} from './proc-service.js';

export class DrmReader {
    #fds = new Map<number, string[]>();

    has(pid: number): boolean {
        return this.#fds.has(pid);
    }

    reset(): void {
        this.#fds = new Map();
    }

    async scan(pids: readonly number[], cancellable: Gio.Cancellable): Promise<void> {
        const found = new Map<number, string[]>();
        await Promise.all(
            pids.map(async pid => {
                const fds = await children(`/proc/${pid}/fd`, 'standard::name,standard::symlink-target', cancellable);
                const drm = fds
                    .filter(({info}) => info.get_attribute_byte_string('standard::symlink-target')?.startsWith('/dev/dri/'))
                    .map(({name}) => name);
                if (drm.length > 0) found.set(pid, drm);
            }),
        );
        this.#fds = found;
    }

    async read(): Promise<Map<number, Engines>> {
        const result = new Map<number, Engines>();
        await Promise.all(
            [...this.#fds].map(async ([pid, fds]) => {
                const texts = await Promise.all(fds.map(fd => readTextFile(`/proc/${pid}/fdinfo/${fd}`)));
                const clients = texts
                    .map(text => (text === null ? null : parseDrmFdinfo(text)))
                    .filter((client): client is DrmClient => client !== null);
                const first = clients[0];
                if (!first) return;
                result.set(pid, {engines: mergeEngines(clients), capacity: {...first.capacity}, driver: first.driver});
            }),
        );
        return result;
    }
}
