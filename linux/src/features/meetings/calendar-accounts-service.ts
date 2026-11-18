import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {Emitter} from '../../shared/emitter.js';
import {needingAttention} from './calendar-accounts.js';
import {ACCOUNT_IFACE, CALENDAR_IFACE, GOA_NAME, GOA_PATH} from './calendar-accounts-service.const.js';
import type {AccountInfo, CalendarFault} from './calendar-accounts.types.js';

export class CalendarAccounts extends Emitter<{changed: []}> {
    readonly #cancellable = new Gio.Cancellable();
    #manager: Gio.DBusObjectManager | null = null;
    #signals: number[] = [];
    #attention: CalendarFault | null = null;
    #destroyed = false;

    constructor(connection: Gio.DBusConnection = Gio.DBus.session) {
        super();
        Gio.DBusObjectManagerClient.new(
            connection,
            Gio.DBusObjectManagerClientFlags.DO_NOT_AUTO_START,
            GOA_NAME,
            GOA_PATH,
            null,
            this.#cancellable,
            (_source, result) => {
                if (this.#destroyed) return;
                try {
                    this.#attach(Gio.DBusObjectManagerClient.new_finish(result));
                } catch {
                    return;
                }
            },
        );
    }

    get attention(): CalendarFault | null {
        return this.#attention;
    }

    destroy(): void {
        this.#destroyed = true;
        this.#cancellable.cancel();
        const manager = this.#manager;
        if (manager) for (const id of this.#signals) GObject.signal_handler_disconnect(manager, id);
        this.#signals = [];
        this.#manager = null;
        this.clearListeners();
    }

    #attach(manager: Gio.DBusObjectManagerClient): void {
        this.#manager = manager;
        const recompute = (): void => {
            this.#recompute();
        };
        this.#signals = [
            manager.connect('object-added', recompute),
            manager.connect('object-removed', recompute),
            manager.connect('interface-proxy-properties-changed', recompute),
        ];
        recompute();
    }

    #recompute(): void {
        const accounts = (this.#manager?.get_objects() ?? []).flatMap(accountOf);
        const next = needingAttention(accounts);
        if (next?.provider === this.#attention?.provider) return;
        this.#attention = next;
        this.emit('changed');
    }
}

function accountOf(object: Gio.DBusObject): AccountInfo[] {
    const account = object.get_interface(ACCOUNT_IFACE) as Gio.DBusProxy | null;
    if (!account) return [];
    const calendar = object.get_interface(CALENDAR_IFACE) as Gio.DBusProxy | null;
    return [
        {
            provider: account.get_cached_property('ProviderName')?.get_string()[0] ?? '',
            attentionNeeded: account.get_cached_property('AttentionNeeded')?.get_boolean() ?? false,
            hasCalendar: calendar !== null,
            calendarDisabled: account.get_cached_property('CalendarDisabled')?.get_boolean() ?? false,
        },
    ];
}
