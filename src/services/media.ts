import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';

import {parseMetadata, pickPlayer} from '../core/media.js';
import type {TrackMetadata} from '../core/media.js';
import {Emitter} from '../util/emitter.js';

const BUS_NAME = 'org.freedesktop.DBus';
const BUS_PATH = '/org/freedesktop/DBus';
const PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYER_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

interface PlayerApp {
    readonly Identity: string | null;
}

interface PlayerControls {
    readonly PlaybackStatus: string | null;
    readonly Metadata: Record<string, GLib.Variant> | null;
    readonly CanGoNext: boolean | null;
    readonly CanGoPrevious: boolean | null;
    PlayPauseAsync(): Promise<unknown>;
    NextAsync(): Promise<unknown>;
    PreviousAsync(): Promise<unknown>;
}

const PlayerAppProxy = Gio.DBusProxy.makeProxyWrapper<PlayerApp>(loadInterfaceXML('org.mpris.MediaPlayer2'));
const PlayerControlsProxy = Gio.DBusProxy.makeProxyWrapper<PlayerControls>(loadInterfaceXML(PLAYER_INTERFACE));

export interface MediaTrack extends TrackMetadata {
    readonly app: string;
    readonly playing: boolean;
    readonly canPrevious: boolean;
    readonly canNext: boolean;
}

class Player {
    readonly #cancellable = new Gio.Cancellable();
    readonly #app: PlayerApp & Gio.DBusProxy;
    readonly #controls: PlayerControls & Gio.DBusProxy;
    #signalId = 0;
    #ready = false;
    #destroyed = false;

    constructor(
        readonly name: string,
        onChange: () => void,
    ) {
        this.#app = PlayerAppProxy(
            Gio.DBus.session,
            name,
            PLAYER_PATH,
            () => {
                if (!this.#destroyed) onChange();
            },
            this.#cancellable,
        );
        this.#controls = PlayerControlsProxy(
            Gio.DBus.session,
            name,
            PLAYER_PATH,
            (_proxy, error) => {
                if (this.#destroyed || error) return;
                this.#signalId = this.#controls.connect('g-properties-changed', onChange);
                this.#ready = true;
                onChange();
            },
            this.#cancellable,
        );
    }

    get ready(): boolean {
        return this.#ready;
    }

    get playing(): boolean {
        return this.#controls.PlaybackStatus === 'Playing';
    }

    get title(): string {
        return this.track().title;
    }

    track(): MediaTrack {
        const metadata: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(this.#controls.Metadata ?? {})) metadata[key] = value.deepUnpack();
        return {
            ...parseMetadata(metadata),
            app: this.#app.Identity ?? '',
            playing: this.playing,
            canPrevious: this.#controls.CanGoPrevious === true,
            canNext: this.#controls.CanGoNext === true,
        };
    }

    playPause(): void {
        this.#controls.PlayPauseAsync().catch(() => undefined);
    }

    next(): void {
        this.#controls.NextAsync().catch(() => undefined);
    }

    previous(): void {
        this.#controls.PreviousAsync().catch(() => undefined);
    }

    destroy(): void {
        this.#destroyed = true;
        this.#cancellable.cancel();
        if (this.#signalId) this.#controls.disconnect(this.#signalId);
    }
}

export class MediaService extends Emitter<{changed: []}> {
    readonly #cancellable = new Gio.Cancellable();
    readonly #players = new Map<string, Player>();
    readonly #subscription: number;
    #destroyed = false;

    constructor() {
        super();
        this.#subscription = Gio.DBus.session.signal_subscribe(
            BUS_NAME,
            BUS_NAME,
            'NameOwnerChanged',
            BUS_PATH,
            PLAYER_PREFIX.slice(0, -1),
            Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            (_connection, _sender, _path, _interface, _signal, parameters) => {
                const [name, , owner] = parameters.deepUnpack<[string, string, string]>();
                this.#remove(name);
                if (owner) this.#add(name);
            },
        );
        void this.#discover();
    }

    get current(): MediaTrack | null {
        return this.#currentPlayer()?.track() ?? null;
    }

    playPause(): void {
        this.#currentPlayer()?.playPause();
    }

    next(): void {
        this.#currentPlayer()?.next();
    }

    previous(): void {
        this.#currentPlayer()?.previous();
    }

    async position(): Promise<number | null> {
        const player = this.#currentPlayer();
        if (!player) return null;
        try {
            const reply = await Gio.DBus.session.call(
                player.name,
                PLAYER_PATH,
                'org.freedesktop.DBus.Properties',
                'Get',
                new GLib.Variant('(ss)', [PLAYER_INTERFACE, 'Position']),
                new GLib.VariantType('(v)'),
                Gio.DBusCallFlags.NONE,
                -1,
                this.#cancellable,
            );
            const [value] = reply.deepUnpack<[GLib.Variant]>();
            const position = value.deepUnpack();
            return typeof position === 'number' ? position : null;
        } catch {
            return null;
        }
    }

    #currentPlayer(): Player | null {
        return pickPlayer([...this.#players.values()].filter(player => player.ready));
    }

    async #discover(): Promise<void> {
        try {
            const reply = await Gio.DBus.session.call(
                BUS_NAME,
                BUS_PATH,
                BUS_NAME,
                'ListNames',
                null,
                new GLib.VariantType('(as)'),
                Gio.DBusCallFlags.NONE,
                -1,
                this.#cancellable,
            );
            if (this.#destroyed) return;
            const [names] = reply.deepUnpack<[string[]]>();
            for (const name of names) if (name.startsWith(PLAYER_PREFIX)) this.#add(name);
        } catch {
            return;
        }
    }

    #add(name: string): void {
        if (this.#destroyed || !name.startsWith(PLAYER_PREFIX) || this.#players.has(name)) return;
        this.#players.set(
            name,
            new Player(name, () => {
                this.emit('changed');
            }),
        );
    }

    #remove(name: string): void {
        const player = this.#players.get(name);
        if (!player) return;
        this.#players.delete(name);
        player.destroy();
        this.emit('changed');
    }

    destroy(): void {
        this.#destroyed = true;
        this.#cancellable.cancel();
        Gio.DBus.session.signal_unsubscribe(this.#subscription);
        for (const player of this.#players.values()) player.destroy();
        this.#players.clear();
        this.clearListeners();
    }
}
