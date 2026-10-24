import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GnomeBluetooth from 'gi://GnomeBluetooth';
import type Gvc from 'gi://Gvc';
import NM from 'gi://NM';
import St from 'gi://St';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

import {brightnessManager, openQuickSettingsToggle} from '../shell/internals.js';
import type {BrightnessScale} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import type {Island} from './island.js';
import {SliderRow, Tile} from './widgets.js';

const NOTIFICATIONS_SCHEMA = 'org.gnome.desktop.notifications';

function defaultSink(mixer: Gvc.MixerControl): Gvc.MixerStream | null {
    return mixer.get_default_sink();
}

function openOptions(island: Island, togglePattern: RegExp, settingsPanel: string): void {
    island.close();
    if (!openQuickSettingsToggle(togglePattern)) Gio.Subprocess.new(['gnome-control-center', settingsPanel], Gio.SubprocessFlags.NONE);
}

export class Controls {
    readonly actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-controls', x_expand: true});

    readonly #disposables = new Disposables();
    readonly #wifi: Tile;
    readonly #bluetoothTile: Tile;
    readonly #dnd: Tile;
    readonly #volume = new SliderRow('audio-volume-high-symbolic', 'Volume');
    readonly #brightness = new SliderRow('display-brightness-symbolic', 'Brilho');
    readonly #notifications = new Gio.Settings({schema_id: NOTIFICATIONS_SCHEMA});
    readonly #bluetooth = new GnomeBluetooth.Client();
    #network: NM.Client | null = null;
    #destroyed = false;

    constructor(island: Island) {
        this.#wifi = new Tile({
            icon: 'network-wireless-symbolic',
            title: 'Wi-Fi',
            onToggle: () => {
                if (this.#network) this.#network.wireless_enabled = !this.#network.wireless_enabled;
            },
            onArrow: () => {
                openOptions(island, /WirelessToggle/, 'wifi');
            },
        });
        this.#bluetoothTile = new Tile({
            icon: 'bluetooth-active-symbolic',
            title: 'Bluetooth',
            onToggle: () => {
                this.#bluetooth.default_adapter_powered = !this.#bluetooth.default_adapter_powered;
            },
            onArrow: () => {
                openOptions(island, /BluetoothToggle/, 'bluetooth');
            },
        });
        this.#dnd = new Tile({
            icon: 'notifications-disabled-symbolic',
            title: 'Não perturbe',
            onToggle: () => this.#notifications.set_boolean('show-banners', !this.#notifications.get_boolean('show-banners')),
        });

        const layout = new Clutter.GridLayout({column_spacing: 10, row_spacing: 10, column_homogeneous: true});
        const grid = new St.Widget({layout_manager: layout, x_expand: true});
        layout.attach(this.#wifi.actor, 0, 0, 1, 1);
        layout.attach(this.#bluetoothTile.actor, 1, 0, 1, 1);
        layout.attach(this.#dnd.actor, 0, 1, 2, 1);
        this.actor.add_child(grid);
        this.actor.add_child(this.#volume.actor);
        this.actor.add_child(this.#brightness.actor);

        void this.#bindNetwork();
        this.#bindBluetooth();
        this.#bindDoNotDisturb();
        this.#bindVolume();
        this.#bindBrightness();
    }

    async #bindNetwork(): Promise<void> {
        let client: NM.Client;
        try {
            client = await new Promise<NM.Client>((resolve, reject) => {
                NM.Client.new_async(null, (_source, result) => {
                    try {
                        resolve(NM.Client.new_finish(result));
                    } catch (error) {
                        reject(error instanceof Error ? error : new Error(String(error)));
                    }
                });
            });
        } catch {
            this.#wifi.actor.hide();
            return;
        }
        if (this.#destroyed) return;
        this.#network = client;
        const sync = (): void => {
            const enabled = client.wireless_enabled;
            this.#wifi.set(enabled, enabled ? ((client.get_primary_connection() as NM.ActiveConnection | null)?.get_id() ?? null) : null);
        };
        this.#disposables.signal(client, client.connect('notify::wireless-enabled', sync));
        this.#disposables.signal(client, client.connect('notify::primary-connection', sync));
        sync();
    }

    #bindBluetooth(): void {
        const client = this.#bluetooth;
        const sync = (): void => {
            const powered = client.default_adapter_powered;
            let connected: string | null = null;
            const devices = client.get_devices();
            for (let i = 0; powered && i < devices.get_n_items(); i++) {
                const device = devices.get_item(i) as GnomeBluetooth.Device | null;
                if (device?.connected) {
                    connected = device.alias || device.name;
                    break;
                }
            }
            this.#bluetoothTile.actor.visible = !!client.default_adapter;
            this.#bluetoothTile.set(powered, connected);
        };
        for (const signal of ['notify::default-adapter-powered', 'notify::default-adapter'] as const)
            this.#disposables.signal(client, client.connect(signal, sync));
        this.#disposables.signal(client, client.connect('device-added', sync));
        this.#disposables.signal(client, client.connect('device-removed', sync));
        sync();
    }

    #bindDoNotDisturb(): void {
        const settings = this.#notifications;
        const sync = (): void => {
            this.#dnd.set(!settings.get_boolean('show-banners'));
        };
        this.#disposables.signal(settings, settings.connect('changed::show-banners', sync));
        sync();
    }

    #bindVolume(): void {
        const mixer = getMixerControl();
        const {slider} = this.#volume;
        const streamSignals = new Disposables();
        let stream: Gvc.MixerStream | null = null;
        let updating = false;

        const bindStream = (): void => {
            streamSignals.dispose();
            stream = defaultSink(mixer);
            this.#volume.actor.visible = stream !== null;
            if (!stream) return;
            const current = stream;
            const sync = (): void => {
                updating = true;
                slider.value = current.is_muted ? 0 : current.volume / mixer.get_vol_max_norm();
                updating = false;
            };
            streamSignals.signal(current, current.connect('notify::volume', sync));
            streamSignals.signal(current, current.connect('notify::is-muted', sync));
            sync();
        };

        this.#disposables.signal(
            slider,
            slider.connect('notify::value', () => {
                if (updating || !stream) return;
                if (stream.is_muted && slider.value > 0) stream.change_is_muted(false);
                stream.volume = slider.value * mixer.get_vol_max_norm();
                stream.push_volume();
            }),
        );
        this.#disposables.signal(mixer, mixer.connect('default-sink-changed', bindStream));
        this.#disposables.signal(mixer, mixer.connect('state-changed', bindStream));
        this.#disposables.add(() => {
            streamSignals.dispose();
        });
        bindStream();
    }

    #bindBrightness(): void {
        const manager = brightnessManager();
        const {slider} = this.#brightness;
        const scaleSignals = new Disposables();
        let scale: BrightnessScale | null = null;
        let updating = false;

        const bindScale = (): void => {
            scaleSignals.dispose();
            scale = manager.globalScale;
            this.#brightness.actor.visible = scale !== null;
            if (!scale) return;
            const current = scale;
            const sync = (): void => {
                updating = true;
                slider.value = current.value;
                updating = false;
            };
            scaleSignals.signal(current, current.connect('notify::value', sync));
            sync();
        };

        this.#disposables.signal(
            slider,
            slider.connect('notify::value', () => {
                if (!updating && scale) scale.value = slider.value;
            }),
        );
        this.#disposables.signal(manager, manager.connect('changed', bindScale));
        this.#disposables.add(() => {
            scaleSignals.dispose();
        });
        bindScale();
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
