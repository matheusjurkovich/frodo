import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';

import {readMemory} from './meminfo.js';
import {ClaudeUsage} from './claude.js';

const PowerProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.freedesktop.UPower.Device'));
const MEMORY_SECONDS = 5;
const MIN_CLAUDE_MINUTES = 2;

export class Data extends EventEmitter {
    constructor(settings) {
        super();
        this._settings = settings;
        this.memory = null;
        this.battery = null;
        this.claude = {session: null, weekly: null, error: null, fetchedAt: 0};
        this._memoryId = 0;
        this._claudeId = 0;
        this._claudeBusy = false;
        this._destroyed = false;
        this._usage = new ClaudeUsage();

        this._proxy = new PowerProxy(Gio.DBus.system, 'org.freedesktop.UPower',
            '/org/freedesktop/UPower/devices/DisplayDevice', (proxy, error) => {
                if (this._destroyed)
                    return;
                if (!error)
                    this._proxyId = this._proxy.connect('g-properties-changed', () => this._syncBattery());
                this._syncBattery();
            });

        this._pollId = settings.connect('changed::claude-poll-minutes', () => this.restartClaudeTimer());
        this.restartClaudeTimer();
        this.refreshClaude();
    }

    _syncBattery() {
        const p = this._proxy;
        this.battery = p?.IsPresent
            ? {percent: Math.round(p.Percentage), charging: p.State === UPower.DeviceState.CHARGING}
            : null;
        this.emit('battery');
    }

    setMemoryWanted(on) {
        if (on === (this._memoryId !== 0))
            return;
        if (!on) {
            GLib.source_remove(this._memoryId);
            this._memoryId = 0;
            return;
        }
        this._readMemory();
        this._memoryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, MEMORY_SECONDS, () => {
            this._readMemory();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _readMemory() {
        const memory = await readMemory();
        if (this._destroyed)
            return;
        this.memory = memory;
        this.emit('memory');
    }

    restartClaudeTimer() {
        if (this._claudeId)
            GLib.source_remove(this._claudeId);
        const minutes = Math.max(MIN_CLAUDE_MINUTES, this._settings.get_int('claude-poll-minutes'));
        this._claudeId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, minutes * 60, () => {
            this.refreshClaude();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async refreshClaude(maxAgeS = 0) {
        if (this._claudeBusy || Date.now() - this.claude.fetchedAt < maxAgeS * 1000)
            return;
        this._claudeBusy = true;
        const result = await this._usage.fetch();
        this._claudeBusy = false;
        if (this._destroyed)
            return;
        this.claude = {...result, fetchedAt: Date.now()};
        this.emit('claude');
    }

    destroy() {
        this._destroyed = true;
        this.setMemoryWanted(false);
        if (this._claudeId)
            GLib.source_remove(this._claudeId);
        this._claudeId = 0;
        this._settings.disconnect(this._pollId);
        if (this._proxyId)
            this._proxy.disconnect(this._proxyId);
        this._usage.destroy();
        this.disconnectAll();
    }
}
