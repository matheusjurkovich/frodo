import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import NM from 'gi://NM';
import {Emitter} from '../../shared/emitter.js';
import {WifiFailureTracker} from './wifi-failure.js';
import type {WifiAttempt, WifiFault, WifiResolution} from './wifi-failure.types.js';

export class WifiFailure extends Emitter<{changed: []}> {
    readonly #tracker = new WifiFailureTracker();
    readonly #cancellable = new Gio.Cancellable();
    readonly #watched = new Map<NM.DeviceWifi, number>();
    #client: NM.Client | null = null;
    #clientSignals: number[] = [];
    #failedDevice: NM.DeviceWifi | null = null;
    #destroyed = false;

    constructor() {
        super();
        NM.Client.new_async(this.#cancellable, (_source, result) => {
            if (this.#destroyed) return;
            try {
                this.#attach(NM.Client.new_finish(result));
            } catch {
                return;
            }
        });
    }

    get failure(): WifiFault | null {
        return this.#tracker.failure;
    }

    get resolution(): WifiResolution | null {
        return this.#tracker.resolution;
    }

    retry(): void {
        const failure = this.#tracker.failure;
        const client = this.#client;
        if (!failure || !client || this.#destroyed) return;
        const connection = client.get_connection_by_uuid(failure.uuid) as NM.RemoteConnection | null;
        if (!connection) return;
        client.activate_connection_async(connection, this.#failedDevice, null, this.#cancellable, (source, result) => {
            try {
                source?.activate_connection_finish(result);
            } catch {
                return;
            }
        });
    }

    async forget(): Promise<boolean> {
        const failure = this.#tracker.failure;
        const connection = failure ? this.#client?.get_connection_by_uuid(failure.uuid) : null;
        if (!connection || this.#destroyed) return false;
        try {
            await connection.delete_async(this.#cancellable);
        } catch {
            return false;
        }
        if (this.#cancellable.is_cancelled()) return false;
        this.#clearFailure('forgotten');
        return true;
    }

    destroy(): void {
        this.#destroyed = true;
        this.#cancellable.cancel();
        const client = this.#client;
        if (client) for (const id of this.#clientSignals) GObject.signal_handler_disconnect(client, id);
        for (const [device, id] of this.#watched) GObject.signal_handler_disconnect(device, id);
        this.#watched.clear();
        this.#clientSignals = [];
        this.#failedDevice = null;
        this.#client = null;
        this.clearListeners();
    }

    #attach(client: NM.Client): void {
        this.#client = client;
        this.#clientSignals = [
            client.connect('device-added', (_client, device) => {
                this.#watch(device);
            }),
            client.connect('device-removed', (_client, device) => {
                this.#unwatch(device);
            }),
            client.connect('connection-removed', (_client, connection) => {
                if (connection.get_uuid() === this.#tracker.failure?.uuid) this.#clearFailure('forgotten');
            }),
        ];
        for (const device of client.get_devices()) this.#watch(device);
    }

    #watch(device: NM.Device): void {
        if (!(device instanceof NM.DeviceWifi) || this.#watched.has(device)) return;
        const id = device.connect('state-changed', (_device, state, _old, reason) => {
            const changed = this.#tracker.observe(state, reason, attemptOf(device));
            this.#failedDevice = this.#tracker.failure ? device : null;
            this.#notify(changed);
        });
        this.#watched.set(device, id);
    }

    #unwatch(device: NM.Device): void {
        if (!(device instanceof NM.DeviceWifi)) return;
        const id = this.#watched.get(device);
        if (id === undefined) return;
        GObject.signal_handler_disconnect(device, id);
        this.#watched.delete(device);
        if (device === this.#failedDevice) this.#clearFailure('off');
    }

    #clearFailure(resolution: WifiResolution): void {
        this.#failedDevice = null;
        this.#notify(this.#tracker.clear(resolution));
    }

    #notify(changed: boolean): void {
        if (changed) this.emit('changed');
    }
}

function attemptOf(device: NM.Device): WifiAttempt | null {
    const active = device.get_active_connection() as NM.ActiveConnection | null;
    if (!active) return null;
    return {id: active.get_id(), uuid: active.get_uuid()};
}
