import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

import {ClaudeIndex} from '../core/claude-index.js';
import {completeLines, parseAssistantLine} from '../core/claude-transcript.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {readTextFile} from './memory.js';
import type {FrodoSettings} from './settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const VERSION = 4;
const CHUNK_BYTES = 1024 * 1024;
const KEPT_MS = 30 * 24 * 60 * 60 * 1000;
const SCAN_SECONDS = 30;
const BATCH = 256;
const GC_EVERY_BYTES = 4 * 1024 * 1024;
const ATTRIBUTES = 'standard::name,standard::type,standard::size,time::modified';

interface Cache {
    index: ClaudeIndex;
    offsets: Map<string, number>;
}

interface Found {
    size: number;
    modified: number;
}

interface Listing {
    found: Map<string, Found>;
    roots: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function emptyCache(): Cache {
    return {index: new ClaudeIndex(), offsets: new Map()};
}

function parseCache(text: string | null): Cache {
    let data: unknown;
    try {
        data = JSON.parse(text ?? '');
    } catch {
        return emptyCache();
    }
    if (!isRecord(data) || data.version !== VERSION || !isRecord(data.files)) return emptyCache();
    const index = ClaudeIndex.fromJSON(data.index);
    if (JSON.stringify(index) !== JSON.stringify(data.index)) return emptyCache();
    const offsets = new Map<string, number>();
    for (const [path, offset] of Object.entries(data.files)) {
        if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) return emptyCache();
        offsets.set(path, offset);
    }
    return {index, offsets};
}

function concat(head: Uint8Array, tail: Uint8Array): Uint8Array {
    if (head.length === 0) return tail;
    const bytes = new Uint8Array(head.length + tail.length);
    bytes.set(head);
    bytes.set(tail, head.length);
    return bytes;
}

function modifiedMs(info: Gio.FileInfo): number {
    return (info.get_modification_date_time()?.to_unix() ?? 0) * 1000;
}

function isTranscript(info: Gio.FileInfo, since: number): boolean {
    return info.get_file_type() === Gio.FileType.REGULAR && info.get_name().endsWith('.jsonl') && modifiedMs(info) >= since;
}

function subagentsDir(session: string): string {
    return GLib.build_filenamev([session, 'subagents']);
}

async function children(dir: string, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[] | null> {
    try {
        const enumerator = await Gio.File.new_for_path(dir).enumerate_children_async(
            ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW,
            cancellable,
        );
        const infos: Gio.FileInfo[] = [];
        try {
            for (let batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_LOW, cancellable); batch.length > 0;) {
                infos.push(...batch);
                batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_LOW, cancellable);
            }
        } finally {
            enumerator.close(null);
        }
        return infos;
    } catch (error) {
        return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) ? [] : null;
    }
}

export class ClaudeTranscripts extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    readonly #cachePath: string;
    readonly #timer = new Timer();
    readonly #cancellable = new Gio.Cancellable();
    #index = new ClaudeIndex();
    #offsets: Map<string, number> | null = null;
    #running: Promise<void> | null = null;
    #dirty = false;
    #destroyed = false;
    #sinceGc = 0;
    #wanted = 0;

    constructor(settings: FrodoSettings, cachePath = GLib.build_filenamev([GLib.get_user_cache_dir(), 'frodo', 'claude-index.json'])) {
        super();
        this.#settings = settings;
        this.#cachePath = cachePath;
    }

    get index(): ClaudeIndex {
        return this.#index;
    }

    get scanning(): boolean {
        return this.#running !== null;
    }

    setWanted(wanted: boolean): void {
        if (this.#destroyed) return;
        const before = this.#wanted;
        this.#wanted = Math.max(0, before + (wanted ? 1 : -1));
        if (this.#wanted === 0) {
            this.#timer.stop();
            return;
        }
        if (before > 0) return;
        this.#timer.every(SCAN_SECONDS, () => {
            void this.scan();
        });
        void this.scan();
    }

    scan(): Promise<void> {
        if (this.#running) return this.#running;
        const running = this.#run().finally(() => {
            this.#running = null;
            if (!this.#destroyed) this.emit('changed');
        });
        this.#running = running;
        this.emit('changed');
        return running;
    }

    async #run(): Promise<void> {
        if (!this.#offsets) ({index: this.#index, offsets: this.#offsets} = parseCache(await readTextFile(this.#cachePath)));
        const offsets = this.#offsets;
        const index = this.#index;
        const {found, roots} = await this.#list();
        for (const [path, {size}] of [...found].sort((a, b) => a[1].modified - b[1].modified)) {
            if (this.#destroyed) return;
            await this.#read(path, size, offsets, index).catch(() => undefined);
        }
        if (this.#destroyed) return;
        for (const path of offsets.keys()) {
            if (found.has(path) || !roots.some(root => path.startsWith(root))) continue;
            offsets.delete(path);
            this.#dirty = true;
        }
        index.prune(Date.now());
        if (this.#dirty) await this.#save();
    }

    async #list(): Promise<Listing> {
        const since = Date.now() - KEPT_MS;
        const found = new Map<string, Found>();
        const roots: string[] = [];
        for (const {configDir} of this.#settings.claudeProfiles) {
            const root = GLib.build_filenamev([configDir, 'projects']);
            const projects = await children(root, this.#cancellable);
            let complete = projects !== null;
            for (const project of projects ?? []) {
                if (project.get_file_type() !== Gio.FileType.DIRECTORY) continue;
                const dir = GLib.build_filenamev([root, project.get_name()]);
                complete = (await this.#collect(dir, since, found, subagentsDir)) && complete;
            }
            if (complete) roots.push(`${root}/`);
        }
        return {found, roots};
    }

    async #collect(dir: string, since: number, found: Map<string, Found>, subdir: (path: string) => string): Promise<boolean> {
        const infos = await children(dir, this.#cancellable);
        if (!infos) return false;
        let complete = true;
        for (const info of infos) {
            const path = GLib.build_filenamev([dir, info.get_name()]);
            if (info.get_file_type() === Gio.FileType.DIRECTORY)
                complete = (await this.#collect(subdir(path), since, found, nested => nested)) && complete;
            else if (isTranscript(info, since)) found.set(path, {size: info.get_size(), modified: modifiedMs(info)});
        }
        return complete;
    }

    async #read(path: string, size: number, offsets: Map<string, number>, index: ClaudeIndex): Promise<void> {
        let offset = offsets.get(path) ?? 0;
        if (size < offset) {
            offset = size;
            offsets.set(path, offset);
            this.#dirty = true;
        }
        if (size === offset) return;
        const stream = await Gio.File.new_for_path(path).read_async(GLib.PRIORITY_LOW, this.#cancellable);
        try {
            stream.seek(offset, GLib.SeekType.SET, this.#cancellable);
            let rest: Uint8Array = new Uint8Array(0);
            for (;;) {
                const chunk = (await stream.read_bytes_async(CHUNK_BYTES, GLib.PRIORITY_LOW, this.#cancellable)).toArray();
                if (chunk.length === 0 || this.#destroyed) return;
                const bytes = concat(rest, chunk);
                const {text, consumed} = completeLines(bytes);
                for (const entry of text.split('\n').map(parseAssistantLine)) if (entry) index.add(entry);
                if (consumed > 0) this.#dirty = true;
                offset += consumed;
                offsets.set(path, offset);
                rest = bytes.subarray(consumed);
                this.#sweep(chunk.length);
            }
        } finally {
            stream.close(null);
        }
    }

    #sweep(bytes: number): void {
        this.#sinceGc += bytes;
        if (this.#sinceGc < GC_EVERY_BYTES) return;
        this.#sinceGc = 0;
        System.gc();
    }

    async #save(): Promise<void> {
        const text = JSON.stringify({version: VERSION, index: this.#index, files: Object.fromEntries(this.#offsets ?? [])});
        this.#dirty = false;
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(this.#cachePath), 0o700);
            await Gio.File.new_for_path(this.#cachePath).replace_contents_bytes_async(
                new GLib.Bytes(new TextEncoder().encode(text)),
                null,
                false,
                Gio.FileCreateFlags.PRIVATE,
                this.#cancellable,
            );
        } catch {
            this.#dirty = true;
        }
    }

    destroy(): void {
        this.#destroyed = true;
        this.#timer.stop();
        this.#cancellable.cancel();
        this.clearListeners();
    }
}
