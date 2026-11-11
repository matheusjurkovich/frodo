import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';

import {MeetLinkClient} from './meet-link-client.js';
import {CALENDAR_BUS, FACTORY_PATH, SOURCES_BUS, SOURCES_PATH, SOURCE_INTERFACE} from './meet-link-client.const.js';
import {Changes, PrivateBus, waitFor} from '../../../tests/fixtures.js';

const MANAGER_XML = `<node><interface name="org.freedesktop.DBus.ObjectManager">
    <method name="GetManagedObjects"><arg type="a{oa{sa{sv}}}" direction="out"/></method>
</interface></node>`;
const FACTORY_XML = `<node><interface name="org.gnome.evolution.dataserver.CalendarFactory">
    <method name="OpenCalendar"><arg type="s" direction="in"/><arg type="s" direction="out"/><arg type="s" direction="out"/></method>
</interface></node>`;
const CALENDAR_XML = `<node><interface name="org.gnome.evolution.dataserver.Calendar">
    <method name="GetObjectList"><arg type="s" direction="in"/><arg type="as" direction="out"/></method>
    <method name="Close"/>
</interface></node>`;

const EVENT = 'BEGIN:VEVENT\r\nSUMMARY:Revisão\r\nX-GOOGLE-CONFERENCE:https://meet.google.com/nep-ynrv-hbb\r\nEND:VEVENT';
const ENABLED = '[Data Source]\nEnabled=true\n\n[Calendar]\n';

class FakeEds extends Changes {
    readonly opened: string[] = [];
    readonly closed: string[] = [];
    readonly failing = new Map<string, number>();
    sources: Record<string, string> = {
        a: ENABLED,
        off: '[Data Source]\nEnabled=false\n\n[Calendar]\n',
        book: '[Data Source]\n[Address Book]\n',
    };
    events: Record<string, string[]> = {a: [EVENT]};

    constructor(
        readonly connection: Gio.DBusConnection,
        bus: PrivateBus,
    ) {
        super();
        bus.serve(connection, SOURCES_PATH, MANAGER_XML, this);
        bus.serve(connection, FACTORY_PATH, FACTORY_XML, this);
        for (const uid of ['a', 'c']) bus.serve(connection, `/cal/${uid}`, CALENDAR_XML, new FakeCalendar(this, uid));
        bus.own(connection, SOURCES_BUS);
        bus.own(connection, CALENDAR_BUS);
    }

    GetManagedObjects(): Record<string, Record<string, Record<string, GLib.Variant>>> {
        const objects: Record<string, Record<string, Record<string, GLib.Variant>>> = {};
        for (const [uid, data] of Object.entries(this.sources))
            objects[`/src/${uid}`] = {
                [SOURCE_INTERFACE]: {UID: new GLib.Variant('s', uid), Data: new GLib.Variant('s', data)},
            };
        return objects;
    }

    OpenCalendar(uid: string): [string, string] {
        this.opened.push(uid);
        const failures = this.failing.get(uid) ?? 0;
        if (failures > 0) {
            this.failing.set(uid, failures - 1);
            throw new Error('EDS reiniciou');
        }
        return [`/cal/${uid}`, CALENDAR_BUS];
    }
}

class FakeCalendar {
    constructor(
        readonly eds: FakeEds,
        readonly uid: string,
    ) {}

    GetObjectList(): string[] {
        return this.eds.events[this.uid] ?? [];
    }

    Close(): void {
        this.eds.closed.push(this.uid);
        this.eds.fire();
    }
}

describe('MeetLinkClient', () => {
    let bus: PrivateBus;
    let eds: FakeEds;
    let client: MeetLinkClient;

    beforeEach(() => {
        bus = new PrivateBus();
        eds = new FakeEds(bus.connect(), bus);
        client = new MeetLinkClient(bus.connect());
    });

    afterEach(() => {
        client.destroy();
        bus.destroy();
    });

    it('acha o link do evento só nos calendários ligados', async () => {
        expect(await client.find('Revisão', Date.now())).toBe('https://meet.google.com/nep-ynrv-hbb');
        expect(eds.opened).toEqual(['a']);
    });

    it('sem evento com esse título devolve nada', async () => {
        expect(await client.find('Outro', Date.now())).toBeNull();
    });

    it('abre cada calendário uma vez, mesmo em buscas simultâneas', async () => {
        await Promise.all([client.find('Revisão', Date.now()), client.find('Revisão', Date.now())]);
        await client.find('Revisão', Date.now());
        expect(eds.opened).toEqual(['a']);
    });

    it('falha ao abrir, fecha o que abriu e tenta de novo', async () => {
        eds.sources = {a: ENABLED, c: ENABLED};
        eds.events = {a: [], c: [EVENT]};
        eds.failing.set('c', 1);
        expect(await client.find('Revisão', Date.now())).toBe('https://meet.google.com/nep-ynrv-hbb');
        await waitFor(eds, () => eds.closed.length > 0);
        expect(eds.closed).toEqual(['a']);
        expect(eds.opened).toEqual(['a', 'c', 'a', 'c']);
    });

    it('sem sucesso nas duas tentativas devolve nada', async () => {
        eds.failing.set('a', 2);
        expect(await client.find('Revisão', Date.now())).toBeNull();
    });

    it('fecha os calendários abertos ao destruir', async () => {
        await client.find('Revisão', Date.now());
        client.destroy();
        await waitFor(eds, () => eds.closed.length === 1);
        expect(eds.closed).toEqual(['a']);
    });
});
