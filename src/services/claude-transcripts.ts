import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {ClaudeIndex} from '../core/claude-index.js';
import {RecentIds, completeLines, parseAssistantLine} from '../core/claude-transcript.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {readTextFile} from './memory.js';
import type {FrodoSettings} from './settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

const VERSION = 1;
const CHUNK_BYTES = 1024 * 1024;
const KEPT_MS = 30 * 24 * 60 * 60 * 1000;
const SCAN_SECONDS = 30;
const BATCH = 256;
const DIR_ATTRIBUTES = 'standard::name,standard::type';
const FILE_ATTRIBUTES = 'standard::name,standard::type,standard::size,time::modified';

interface FileState {
    offset: number;
    recent: RecentIds;
}

interface Cache {
    index: ClaudeIndex;
    files: Map<string, FileState>;
}

interface Listing {
    sizes: Map<string, number>;
    roots: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function emptyCache(): Cache {
    return {index: new ClaudeIndex(), files: new Map()};
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
    const files = new Map<string, FileState>();
    for (const [path, entry] of Object.entries(data.files)) {
        if (!isRecord(entry) || typeof entry.offset !== 'number' || !Number.isSafeInteger(entry.offset) || entry.offset < 0)
            return emptyCache();
        files.set(path, {offset: entry.offset, recent: RecentIds.from(entry.recent)});
    }
    return {index, files};
}

function concat(head: Uint8Array, tail: Uint8Array): Uint8Array {
    if (head.length === 0) return tail;
    const bytes = new Uint8Array(head.length + tail.length);
    bytes.set(head);
    bytes.set(tail, head.length);
    return bytes;
}

async function children(dir: string, attributes: string, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[] | null> {
    try {
        const enumerator = await Gio.File.new_for_path(dir).enumerate_children_async(
            attributes,
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
    #files: Map<string, FileState> | null = null;
    #running: Promise<void> | null = null;
    #dirty = false;
    #destroyed = false;

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
        if (wanted === this.#timer.active || this.#destroyed) return;
        if (!wanted) {
            this.#timer.stop();
            return;
        }
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
        if (!this.#files) ({index: this.#index, files: this.#files} = parseCache(await readTextFile(this.#cachePath)));
        const files = this.#files;
        const index = this.#index;
        const {sizes, roots} = await this.#list();
        for (const [path, size] of sizes) {
            if (this.#destroyed) return;
            const state = files.get(path) ?? {offset: 0, recent: new RecentIds()};
            files.set(path, state);
            await this.#read(path, size, state, index).catch(() => undefined);
        }
        if (this.#destroyed) return;
        for (const path of files.keys()) {
            if (sizes.has(path) || !roots.some(root => path.startsWith(root))) continue;
            files.delete(path);
            this.#dirty = true;
        }
        index.prune(Date.now());
        if (this.#dirty) await this.#save();
    }

    async #list(): Promise<Listing> {
        const since = Date.now() - KEPT_MS;
        const sizes = new Map<string, number>();
        const roots: string[] = [];
        for (const {configDir} of this.#settings.claudeProfiles) {
            const root = GLib.build_filenamev([configDir, 'projects']);
            const projects = await children(root, DIR_ATTRIBUTES, this.#cancellable);
            let complete = projects !== null;
            for (const project of projects ?? []) {
                if (project.get_file_type() !== Gio.FileType.DIRECTORY) continue;
                const dir = GLib.build_filenamev([root, project.get_name()]);
                const infos = await children(dir, FILE_ATTRIBUTES, this.#cancellable);
                complete &&= infos !== null;
                for (const info of infos ?? []) {
                    const modified = info.get_modification_date_time()?.to_unix() ?? 0;
                    if (info.get_file_type() !== Gio.FileType.REGULAR || !info.get_name().endsWith('.jsonl') || modified * 1000 < since)
                        continue;
                    sizes.set(GLib.build_filenamev([dir, info.get_name()]), info.get_size());
                }
            }
            if (complete) roots.push(`${root}/`);
        }
        return {sizes, roots};
    }

    async #read(path: string, size: number, state: FileState, index: ClaudeIndex): Promise<void> {
        if (size < state.offset) {
            state.offset = size;
            this.#dirty = true;
        }
        if (size === state.offset) return;
        const stream = await Gio.File.new_for_path(path).read_async(GLib.PRIORITY_LOW, this.#cancellable);
        try {
            stream.seek(state.offset, GLib.SeekType.SET, this.#cancellable);
            let rest: Uint8Array = new Uint8Array(0);
            for (;;) {
                const chunk = (await stream.read_bytes_async(CHUNK_BYTES, GLib.PRIORITY_LOW, this.#cancellable)).toArray();
                if (chunk.length === 0 || this.#destroyed) return;
                const bytes = concat(rest, chunk);
                const {text, consumed} = completeLines(bytes);
                for (const entry of text.split('\n').map(parseAssistantLine)) {
                    if (!entry) continue;
                    if (!state.recent.seen(entry.usage.id)) index.add(entry);
                    else if (entry.todos) index.setTodos(entry.usage.sessionId, entry.usage.timestamp, entry.todos);
                }
                if (consumed > 0) this.#dirty = true;
                state.offset += consumed;
                rest = bytes.subarray(consumed);
            }
        } finally {
            stream.close(null);
        }
    }

    async #save(): Promise<void> {
        const text = JSON.stringify({version: VERSION, index: this.#index, files: Object.fromEntries(this.#files ?? [])});
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
