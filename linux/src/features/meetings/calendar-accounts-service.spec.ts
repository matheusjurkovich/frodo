import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';

import {CalendarAccounts} from './calendar-accounts-service.js';
import {ACCOUNT_IFACE, CALENDAR_IFACE, GOA_NAME, GOA_PATH} from './calendar-accounts-service.const.js';
import {PrivateBus, waitFor} from '../../../tests/fixtures.js';

const ACCOUNT_PATH = `${GOA_PATH}/Accounts/account_1`;

const MANAGER_XML = `<node><interface name="org.freedesktop.DBus.ObjectManager">
<method name="GetManagedObjects"><arg type="a{oa{sa{sv}}}" direction="out"/></method>
<signal name="InterfacesAdded"><arg type="o"/><arg type="a{sa{sv}}"/></signal>
<signal name="InterfacesRemoved"><arg type="o"/><arg type="as"/></signal>
</interface></node>`;

const ACCOUNT_XML = `<node><interface name="${ACCOUNT_IFACE}">
<property name="ProviderName" type="s" access="read"/>
<property name="AttentionNeeded" type="b" access="read"/>
<property name="CalendarDisabled" type="b" access="read"/>
</interface></node>`;

const CALENDAR_XML = `<node><interface name="${CALENDAR_IFACE}">
<property name="Uri" type="s" access="read"/>
</interface></node>`;

class FakeGoa {
    readonly ProviderName = 'Google';
    AttentionNeeded = true;
    readonly CalendarDisabled = false;
    readonly Uri = 'https://calendar.example';
    readonly #account: Gio.DBusExportedObject;

    constructor(bus: PrivateBus, connection: Gio.DBusConnection) {
        bus.serve(connection, GOA_PATH, MANAGER_XML, {
            GetManagedObjects: () => ({
                [ACCOUNT_PATH]: {
                    [ACCOUNT_IFACE]: this.#accountProperties(),
                    [CALENDAR_IFACE]: {Uri: new GLib.Variant('s', this.Uri)},
                },
            }),
        });
        this.#account = bus.serve(connection, ACCOUNT_PATH, ACCOUNT_XML, this);
        bus.serve(connection, ACCOUNT_PATH, CALENDAR_XML, this);
        bus.own(connection, GOA_NAME);
    }

    needAttention(value: boolean): void {
        this.AttentionNeeded = value;
        this.#account.emit_property_changed('AttentionNeeded', new GLib.Variant('b', value));
    }

    #accountProperties(): Record<string, GLib.Variant> {
        return {
            ProviderName: new GLib.Variant('s', this.ProviderName),
            AttentionNeeded: new GLib.Variant('b', this.AttentionNeeded),
            CalendarDisabled: new GLib.Variant('b', this.CalendarDisabled),
        };
    }
}

describe('CalendarAccounts', () => {
    let bus: PrivateBus;
    let accounts: CalendarAccounts | null = null;

    beforeEach(() => {
        bus = new PrivateBus();
    });

    afterEach(() => {
        accounts?.destroy();
        accounts = null;
        bus.destroy();
    });

    it('conta com atenção pendente vira falha e some quando resolve', async () => {
        const fake = new FakeGoa(bus, bus.connect());
        accounts = new CalendarAccounts(bus.connect());
        await waitFor(accounts, () => accounts?.attention !== null);
        expect(accounts.attention?.provider).toBe('Google');
        fake.needAttention(false);
        await waitFor(accounts, () => accounts?.attention === null);
        expect(accounts.attention).toBeNull();
    });

    it('sem GOA no barramento a atenção fica nula', async () => {
        accounts = new CalendarAccounts(bus.connect());
        await new Promise<void>(resolve => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
        expect(accounts.attention).toBeNull();
    });
});
