import Gio from 'gi://Gio';
import {listDirectory} from '../../shared/files.js';
import {ENUMERATE_BATCH} from './performance-service.const.js';
import type {Child} from './performance-service.types.js';

export async function children(path: string, attributes: string, cancellable: Gio.Cancellable): Promise<Child[]> {
    try {
        const infos = await listDirectory(path, attributes, {
            flags: Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            batch: ENUMERATE_BATCH,
            cancellable,
        });
        return infos.map(info => ({name: info.get_name(), info}));
    } catch {
        return [];
    }
}
