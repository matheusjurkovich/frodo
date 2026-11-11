import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {listDirectory} from './files.js';
import type {ListOptions} from './files.types.js';
import type {LineSink} from './scan-files.types.js';

Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

export async function readRange(path: string, offset: number, length: number, cancellable: Gio.Cancellable): Promise<Uint8Array> {
    const stream = await Gio.File.new_for_path(path).read_async(GLib.PRIORITY_LOW, cancellable);
    try {
        stream.seek(offset, GLib.SeekType.SET, cancellable);
        const bytes = new Uint8Array(length);
        let filled = 0;
        while (filled < length) {
            const chunk = (await stream.read_bytes_async(length - filled, GLib.PRIORITY_LOW, cancellable)).toArray();
            if (chunk.length === 0) break;
            bytes.set(chunk, filled);
            filled += chunk.length;
        }
        return bytes.subarray(0, filled);
    } finally {
        stream.close(null);
    }
}

export function consumeLines(bytes: Uint8Array, sink: LineSink): number {
    const end = bytes.lastIndexOf(10) + 1;
    const decoder = new TextDecoder();
    if (end > 0) sink.feed(decoder.decode(bytes.subarray(0, end)));
    const rest = bytes.subarray(end);
    return rest.length > 0 && sink.line(decoder.decode(rest)) ? bytes.length : end;
}

export async function listIfPresent(dir: string, attributes: string, options: ListOptions): Promise<Gio.FileInfo[] | null> {
    try {
        return await listDirectory(dir, attributes, options);
    } catch (error) {
        return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) ? [] : null;
    }
}
