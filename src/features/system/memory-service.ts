import {readTextFile} from '../../shared/files.js';
import {parseMeminfo} from './memory.js';
import type {MemoryInfo} from './memory.js';

export async function readMemory(): Promise<MemoryInfo | null> {
    const text = await readTextFile('/proc/meminfo');
    return text === null ? null : parseMeminfo(text);
}
