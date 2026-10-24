import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GnomeBluetooth from 'gi://GnomeBluetooth';
import NM from 'gi://NM';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

Gio._promisify(NM.Client, 'new_async');

function tile({icon, title, onToggle, onArrow}) {
    const box = new St.BoxLayout({style_class: 'frodo-tile', x_expand: true});
    const main = new St.Button({style_class: 'frodo-tile-main', x_expand: true, can_focus: true});
    const content = new St.BoxLayout({style: 'spacing: 8px;', x_expand: true, x_align: Clutter.ActorAlign.START});
    const iconActor = new St.Icon({icon_name: icon, style_class: 'frodo-tile-icon'});
    const texts = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER});
    const titleLabel = new St.Label({text: title, style_class: 'frodo-tile-title'});
    const sub = new St.Label({style_class: 'frodo-tile-sub', visible: false});
    texts.add_child(titleLabel);
    texts.add_child(sub);
    content.add_child(iconActor);
    content.add_child(texts);
    main.child = content;
    main.connect('clicked', onToggle);
    box.add_child(main);
    if (onArrow) {
        const arrow = new St.Button({
            style_class: 'frodo-tile-arrow',
            child: new St.Icon({icon_name: 'go-next-symbolic', icon_size: 12}),
            can_focus: true,
        });
        arrow.connect('clicked', onArrow);
        box.add_child(arrow);
    }
    return {
        actor: box,
        set(on, subtitle) {
            if (on)
                box.add_style_class_name('frodo-tile-on');
            else
                box.remove_style_class_name('frodo-tile-on');
            sub.text = subtitle ?? '';
            sub.visible = !!subtitle;
        },
    };
}

function sliderRow(icon) {
    const row = new St.BoxLayout({style_class: 'frodo-slider-row', x_expand: true});
    const slider = new Slider(0);
    slider.x_expand = true;
    row.add_child(new St.Icon({icon_name: icon, style_class: 'frodo-slider-icon'}));
    row.add_child(slider);
    return {row, slider};
}

function openQuickSettingsToggle(pattern, fallbackPanel, island) {
    island.close();
    const qs = Main.panel.statusArea.quickSettings;
    const item = qs?._network?.quickSettingsItems?.concat(qs?._bluetooth?.quickSettingsItems ?? [])
        .find(i => pattern.test(i.constructor.$gtype.name));
    if (!item?.menu || !Main.layoutManager.panelBox.visible) {
        Gio.Subprocess.new(['gnome-control-center', fallbackPanel], Gio.SubprocessFlags.NONE);
        return;
    }
    qs.menu.open();
    item.menu.open();
}

export class Controls {
    constructor(island) {
        this._island = island;
        this._destroyed = false;
        this.actor = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'frodo-controls', x_expand: true});

        const grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({column_spacing: 6, row_spacing: 6, column_homogeneous: true}),
            x_expand: true,
        });
        const gl = grid.layout_manager;

        this._wifi = tile({
            icon: 'network-wireless-symbolic',
            title: 'Wi-Fi',
            onToggle: () => {
                if (this._nm)
                    this._nm.wireless_enabled = !this._nm.wireless_enabled;
            },
            onArrow: () => openQuickSettingsToggle(/WirelessToggle/, 'wifi', island),
        });
        this._bt = tile({
            icon: 'bluetooth-active-symbolic',
            title: 'Bluetooth',
            onToggle: () => {
                this._bluetooth.default_adapter_powered = !this._bluetooth.default_adapter_powered;
            },
            onArrow: () => openQuickSettingsToggle(/BluetoothToggle/, 'bluetooth', island),
        });
        this._dnd = tile({
            icon: 'notifications-disabled-symbolic',
            title: 'Não perturbe',
            onToggle: () => {
                this._notif.set_boolean('show-banners', !this._notif.get_boolean('show-banners'));
            },
        });
        gl.attach(this._wifi.actor, 0, 0, 1, 1);
        gl.attach(this._bt.actor, 1, 0, 1, 1);
        gl.attach(this._dnd.actor, 0, 1, 2, 1);
        this.actor.add_child(grid);

        this._volume = sliderRow('audio-volume-high-symbolic');
        this._brightness = sliderRow('display-brightness-symbolic');
        this.actor.add_child(this._volume.row);
        this.actor.add_child(this._brightness.row);

        this._initNetwork();
        this._initBluetooth();
        this._initDnd();
        this._initVolume();
        this._initBrightness();
        this._initPower();
    }

    async _initNetwork() {
        try {
            this._nm = await NM.Client.new_async(null);
        } catch {
            this._wifi.actor.hide();
            return;
        }
        if (this._destroyed)
            return;
        const sync = () => {
            const on = this._nm.wireless_enabled;
            const ssid = on ? this._nm.get_primary_connection()?.get_id() : null;
            this._wifi.set(on, ssid);
        };
        this._nmIds = ['notify::wireless-enabled', 'notify::primary-connection']
            .map(s => this._nm.connect(s, sync));
        sync();
    }

    _initBluetooth() {
        this._bluetooth = new GnomeBluetooth.Client();
        const sync = () => {
            const on = this._bluetooth.default_adapter_powered;
            const store = this._bluetooth.get_devices();
            let name = null;
            for (let i = 0; on && i < store.get_n_items(); i++) {
                const dev = store.get_item(i);
                if (dev.connected) {
                    name = dev.alias || dev.name;
                    break;
                }
            }
            this._bt.actor.visible = !!this._bluetooth.default_adapter;
            this._bt.set(on, name);
        };
        this._btIds = ['notify::default-adapter-powered', 'notify::default-adapter', 'device-added', 'device-removed']
            .map(s => this._bluetooth.connect(s, sync));
        sync();
    }

    _initDnd() {
        this._notif = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        const sync = () => this._dnd.set(!this._notif.get_boolean('show-banners'));
        this._notifId = this._notif.connect('changed::show-banners', sync);
        sync();
    }

    _initVolume() {
        this._mixer = getMixerControl();
        const slider = this._volume.slider;
        let block = false;
        const bindStream = () => {
            if (this._stream && this._streamIds)
                this._streamIds.forEach(id => this._stream.disconnect(id));
            this._stream = this._mixer.get_default_sink();
            this._streamIds = [];
            if (!this._stream) {
                this._volume.row.hide();
                return;
            }
            this._volume.row.show();
            const sync = () => {
                block = true;
                slider.value = this._stream.is_muted ? 0 : this._stream.volume / this._mixer.get_vol_max_norm();
                block = false;
            };
            this._streamIds = ['notify::volume', 'notify::is-muted'].map(s => this._stream.connect(s, sync));
            sync();
        };
        this._sliderVolId = slider.connect('notify::value', () => {
            if (block || !this._stream)
                return;
            if (this._stream.is_muted && slider.value > 0)
                this._stream.change_is_muted(false);
            this._stream.volume = slider.value * this._mixer.get_vol_max_norm();
            this._stream.push_volume();
        });
        this._mixerIds = ['default-sink-changed', 'state-changed'].map(s => this._mixer.connect(s, bindStream));
        bindStream();
    }

    _initBrightness() {
        const manager = Main.brightnessManager;
        const slider = this._brightness.slider;
        let block = false;
        const bindScale = () => {
            if (this._scale && this._scaleId)
                this._scale.disconnect(this._scaleId);
            this._scale = manager.globalScale;
            this._scaleId = 0;
            this._brightness.row.visible = !!this._scale;
            if (!this._scale)
                return;
            const sync = () => {
                block = true;
                slider.value = this._scale.value;
                block = false;
            };
            this._scaleId = this._scale.connect('notify::value', sync);
            sync();
        };
        this._sliderBrId = slider.connect('notify::value', () => {
            if (!block && this._scale)
                this._scale.value = slider.value;
        });
        this._managerId = manager.connect('changed', bindScale);
        bindScale();
    }

    _initPower() {
        this.powerButton = new St.Button({
            style_class: 'frodo-round-button',
            child: new St.Icon({icon_name: 'system-shutdown-symbolic', icon_size: 14}),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._powerMenu = new PopupMenu.PopupMenu(this.powerButton, 0.5, St.Side.TOP);
        this._powerMenu.actor.add_style_class_name('frodo-menu');
        Main.uiGroup.add_child(this._powerMenu.actor);
        this._powerMenu.actor.hide();
        this._menuManager = new PopupMenu.PopupMenuManager(this.powerButton);
        this._menuManager.addMenu(this._powerMenu);
        this._releasePower = this._island.holdWhileOpen(this._powerMenu);
        const actions = SystemActions.getDefault();
        const run = fn => () => {
            this._island.close();
            fn.call(actions);
        };
        this._powerMenu.addAction('Bloquear', run(actions.activateLockScreen), 'system-lock-screen-symbolic');
        this._powerMenu.addAction('Suspender', run(actions.activateSuspend), 'media-playback-pause-symbolic');
        this._powerMenu.addAction('Sair', run(actions.activateLogout), 'system-log-out-symbolic');
        this._powerMenu.addAction('Reiniciar', run(actions.activateRestart), 'system-reboot-symbolic');
        this._powerMenu.addAction('Desligar', run(actions.activatePowerOff), 'system-shutdown-symbolic');
        this.powerButton.connect('clicked', () => this._powerMenu.toggle());
    }

    destroy() {
        this._destroyed = true;
        this._nmIds?.forEach(id => this._nm.disconnect(id));
        this._btIds.forEach(id => this._bluetooth.disconnect(id));
        this._bluetooth = null;
        this._notif.disconnect(this._notifId);
        this._streamIds?.forEach(id => this._stream.disconnect(id));
        this._mixerIds.forEach(id => this._mixer.disconnect(id));
        if (this._scaleId)
            this._scale.disconnect(this._scaleId);
        Main.brightnessManager.disconnect(this._managerId);
        this._releasePower();
        this._menuManager.removeMenu(this._powerMenu);
        this._powerMenu.destroy();
        this.powerButton.destroy();
        this.actor.destroy();
    }
}
