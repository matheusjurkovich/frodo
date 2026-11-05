import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {FrodoSettings} from '../src/settings/frodo-settings.js';
import {Emitter} from '../src/shared/emitter.js';
import {Timer} from '../src/shared/timer.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.frodo';

export interface LineOptions {
    id: string;
    at: Date;
    model?: string;
    cwd?: string;
    session?: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    branch?: string;
    todos?: string[];
    sidechain?: boolean;
}

export function line(o: LineOptions): string {
    const content = o.todos
        ? [{type: 'tool_use', name: 'TodoWrite', input: {todos: o.todos.map(status => ({status}))}}]
        : [{type: 'text', text: 'ok'}];
    return JSON.stringify({
        type: 'assistant',
        timestamp: o.at.toISOString(),
        sessionId: o.session ?? 's1',
        cwd: o.cwd ?? '/home/u/frodo',
        gitBranch: o.branch ?? 'main',
        isSidechain: o.sidechain ?? false,
        message: {
            id: o.id,
            model: o.model ?? 'claude-opus-5-5',
            content,
            usage: {
                input_tokens: o.input ?? 0,
                output_tokens: o.output ?? 0,
                cache_read_input_tokens: o.cacheRead ?? 0,
                cache_creation_input_tokens: o.cacheWrite ?? 0,
            },
        },
    });
}

export function createSettings(): FrodoSettings {
    const source = Gio.SettingsSchemaSource.new_from_directory('.build', Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup(SCHEMA_ID, false);
    if (!schema) throw new Error('schema não compilado em .build');
    return new FrodoSettings(new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()}));
}

export class Changes extends Emitter<{changed: []}> {
    fire(): void {
        this.emit('changed');
    }
}

export function waitFor(source: Pick<Emitter<{changed: []}>, 'on'>, ready: () => boolean, ms = 2000): Promise<void> {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = new Timer();
        const off = source.on('changed', () => {
            if (!ready()) return;
            timer.stop();
            off();
            resolve();
        });
        timer.once(ms, () => {
            off();
            reject(new Error(`condição não cumprida em ${ms} ms`));
        });
    });
}

export function tmpDir(dirs: string[]): string {
    const dir = GLib.dir_make_tmp('frodo-spec-XXXXXX');
    dirs.push(dir);
    return dir;
}

export function removeDirs(dirs: string[]): void {
    for (const dir of dirs.splice(0)) GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(dir)}`);
}

export function writeFile(path: string, content: string, modifiedMs?: number): void {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
    GLib.file_set_contents(path, content);
    if (modifiedMs !== undefined)
        Gio.File.new_for_path(path).set_attribute_uint64(
            'time::modified',
            Math.floor(modifiedMs / 1000),
            Gio.FileQueryInfoFlags.NONE,
            null,
        );
}

export function shellSettings(schemaId: string): Gio.Settings {
    const source = Gio.SettingsSchemaSource.new_from_directory('.build/shell', null, false);
    const schema = source.lookup(schemaId, false);
    if (!schema) throw new Error(`schema ${schemaId} não compilado em .build/shell`);
    return new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()});
}

export class PrivateBus {
    readonly #dirs: string[] = [];
    readonly #daemon: Gio.Subprocess;
    readonly #address: string;
    readonly #connections: Gio.DBusConnection[] = [];

    constructor() {
        const config = `${tmpDir(this.#dirs)}/bus.conf`;
        GLib.file_set_contents(
            config,
            `<busconfig><type>session</type><listen>unix:tmpdir=${GLib.path_get_dirname(config)}</listen>` +
                '<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy>' +
                '</busconfig>',
        );
        this.#daemon = Gio.Subprocess.new(
            ['dbus-daemon', `--config-file=${config}`, '--print-address', '--nofork'],
            Gio.SubprocessFlags.STDOUT_PIPE,
        );
        const stdout = this.#daemon.get_stdout_pipe();
        const [address] = stdout ? new Gio.DataInputStream({base_stream: stdout}).read_line_utf8(null) : [null];
        if (!address) throw new Error('dbus-daemon não informou o endereço');
        this.#address = address;
    }

    connect(): Gio.DBusConnection {
        const connection = new Gio.DBusConnection({
            address: this.#address,
            flags: Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        });
        connection.init(null);
        this.#connections.push(connection);
        return connection;
    }

    serve(connection: Gio.DBusConnection, path: string, xml: string, implementation: object): Gio.DBusExportedObject {
        const exported = Gio.DBusExportedObject.wrapJSObject(xml, implementation);
        exported.export(connection, path);
        return exported;
    }

    own(connection: Gio.DBusConnection, name: string): void {
        this.#busCall(connection, 'RequestName', new GLib.Variant('(su)', [name, 4]));
    }

    release(connection: Gio.DBusConnection, name: string): void {
        this.#busCall(connection, 'ReleaseName', new GLib.Variant('(s)', [name]));
    }

    #busCall(connection: Gio.DBusConnection, method: string, parameters: GLib.Variant): void {
        connection.call_sync(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            method,
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
    }

    destroy(): void {
        for (const connection of this.#connections.splice(0)) if (!connection.is_closed()) connection.close_sync(null);
        this.#daemon.force_exit();
        this.#daemon.wait(null);
        removeDirs(this.#dirs);
    }
}

export function settle(ms = 0): Promise<void> {
    return new Promise(resolve => {
        new Timer().once(ms, resolve);
    });
}
