import Gio from 'gi://Gio';

import {parseMeminfo} from '../core/memory.js';
import type {MemoryInfo} from '../core/types.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

export async function readTextFile(path: string): Promise<string | null> {
    try {
        const [bytes] = await Gio.File.new_for_path(path).load_contents_async(null);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export async function readMemory(): Promise<MemoryInfo | null> {
    const text = await readTextFile('/proc/meminfo');
    return text === null ? null : parseMeminfo(text);
}
