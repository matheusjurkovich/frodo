import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {LIST_BATCH} from './files.const.js';
import type {ListOptions} from './files.types.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');

Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

export async function readTextFile(path: string): Promise<string | null> {
    try {
        const [bytes] = await Gio.File.new_for_path(path).load_contents_async(null);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export async function listDirectory(path: string, attributes: string, options: ListOptions = {}): Promise<Gio.FileInfo[]> {
    const {flags = Gio.FileQueryInfoFlags.NONE, priority = GLib.PRIORITY_LOW, batch = LIST_BATCH, cancellable = null} = options;
    const enumerator = await Gio.File.new_for_path(path).enumerate_children_async(attributes, flags, priority, cancellable);
    const infos: Gio.FileInfo[] = [];
    try {
        for (let next = await enumerator.next_files_async(batch, priority, cancellable); next.length > 0;) {
            infos.push(...next);
            next = await enumerator.next_files_async(batch, priority, cancellable);
        }
    } finally {
        enumerator.close(null);
    }
    return infos;
}

export function modifiedMs(info: Gio.FileInfo): number {
    return (info.get_modification_date_time()?.to_unix() ?? 0) * 1000;
}
