import Gio from 'gi://Gio';
import UPower from 'gi://UPowerGlib';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';

import type {BatteryInfo} from '../core/types.js';
import {Emitter} from '../util/emitter.js';

interface DisplayDevice {
    readonly IsPresent: boolean;
    readonly Percentage: number;
    readonly State: UPower.DeviceState;
}

const DisplayDeviceProxy = Gio.DBusProxy.makeProxyWrapper<DisplayDevice>(loadInterfaceXML('org.freedesktop.UPower.Device'));

export class BatteryMonitor extends Emitter<{changed: []}> {
    #battery: BatteryInfo | null = null;
    #signalId = 0;
    #destroyed = false;
    readonly #proxy: DisplayDevice & Gio.DBusProxy;

    constructor() {
        super();
        this.#proxy = DisplayDeviceProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice',
            (_proxy, error) => {
                if (this.#destroyed) return;
                if (!error)
                    this.#signalId = this.#proxy.connect('g-properties-changed', () => {
                        this.#sync();
                    });
                this.#sync();
            },
        );
    }

    get battery(): BatteryInfo | null {
        return this.#battery;
    }

    #sync(): void {
        const device = this.#proxy;
        this.#battery = device.IsPresent
            ? {percent: Math.round(device.Percentage), charging: device.State === UPower.DeviceState.CHARGING}
            : null;
        this.emit('changed');
    }

    destroy(): void {
        this.#destroyed = true;
        if (this.#signalId) this.#proxy.disconnect(this.#signalId);
        this.clearListeners();
    }
}
