import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {isEnabledCalendar, meetLinkFor, rangeQuery} from './meet-link.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const SOURCES_BUS = 'org.gnome.evolution.dataserver.Sources5';
const SOURCES_PATH = '/org/gnome/evolution/dataserver/SourceManager';
const SOURCE_INTERFACE = 'org.gnome.evolution.dataserver.Source';
const CALENDAR_BUS = 'org.gnome.evolution.dataserver.Calendar8';
const FACTORY_PATH = '/org/gnome/evolution/dataserver/CalendarFactory';
const FACTORY_INTERFACE = 'org.gnome.evolution.dataserver.CalendarFactory';
const CALENDAR_INTERFACE = 'org.gnome.evolution.dataserver.Calendar';

type ManagedObjects = Record<string, Record<string, Record<string, unknown>>>;

interface OpenCalendar {
    readonly path: string;
    readonly bus: string;
}

export class MeetLinkClient {
    readonly #cancellable = new Gio.Cancellable();
    readonly #opened = new Map<string, OpenCalendar>();

    async find(title: string, startsAt: number): Promise<string | null> {
        try {
            for (const uid of await this.#calendars()) {
                const calendar = await this.#open(uid);
                const reply = await this.#call(
                    calendar.bus,
                    calendar.path,
                    CALENDAR_INTERFACE,
                    'GetObjectList',
                    new GLib.Variant('(s)', [rangeQuery(startsAt)]),
                    '(as)',
                );
                const [objects] = reply.deepUnpack<[string[]]>();
                const link = meetLinkFor(objects, title);
                if (link) return link;
            }
        } catch {
            return null;
        }
        return null;
    }

    async #calendars(): Promise<string[]> {
        const reply = await this.#call(
            SOURCES_BUS,
            SOURCES_PATH,
            'org.freedesktop.DBus.ObjectManager',
            'GetManagedObjects',
            null,
            '(a{oa{sa{sv}}})',
        );
        const [objects] = reply.recursiveUnpack<[ManagedObjects]>();
        const uids: string[] = [];
        for (const interfaces of Object.values(objects)) {
            const source = interfaces[SOURCE_INTERFACE];
            const uid = source?.UID;
            const data = source?.Data;
            if (typeof uid === 'string' && typeof data === 'string' && isEnabledCalendar(data)) uids.push(uid);
        }
        return uids;
    }

    async #open(uid: string): Promise<OpenCalendar> {
        const known = this.#opened.get(uid);
        if (known) return known;
        const reply = await this.#call(
            CALENDAR_BUS,
            FACTORY_PATH,
            FACTORY_INTERFACE,
            'OpenCalendar',
            new GLib.Variant('(s)', [uid]),
            '(ss)',
        );
        const [path, bus] = reply.deepUnpack<[string, string]>();
        const calendar = {path, bus};
        this.#opened.set(uid, calendar);
        return calendar;
    }

    #call(bus: string, path: string, iface: string, method: string, parameters: GLib.Variant | null, reply: string): Promise<GLib.Variant> {
        return Gio.DBus.session.call(
            bus,
            path,
            iface,
            method,
            parameters,
            new GLib.VariantType(reply),
            Gio.DBusCallFlags.NONE,
            -1,
            this.#cancellable,
        );
    }

    destroy(): void {
        this.#cancellable.cancel();
        for (const {bus, path} of this.#opened.values())
            Gio.DBus.session.call(bus, path, CALENDAR_INTERFACE, 'Close', null, null, Gio.DBusCallFlags.NONE, -1, null, null);
        this.#opened.clear();
    }
}
