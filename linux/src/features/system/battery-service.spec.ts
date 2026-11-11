import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';

import {BatteryMonitor} from './battery-service.js';
import {PrivateBus, settle, waitFor} from '../../../tests/fixtures.js';
import {loadInterfaceXML} from '../../../tests/shell/fileUtils.js';

describe('BatteryMonitor', () => {
    const path = '/org/freedesktop/UPower/devices/DisplayDevice';
    const device = {IsPresent: true, Percentage: 57.6, State: 1};
    let bus: PrivateBus;
    let client: Gio.DBusConnection;
    let service: Gio.DBusConnection;
    let upower: Gio.DBusExportedObject;
    const monitors: BatteryMonitor[] = [];

    function monitor(): BatteryMonitor {
        const created = new BatteryMonitor(client);
        monitors.push(created);
        return created;
    }

    function change(values: Partial<typeof device>): void {
        Object.assign(device, values);
        if (values.Percentage !== undefined) upower.emit_property_changed('Percentage', new GLib.Variant('d', values.Percentage));
        if (values.State !== undefined) upower.emit_property_changed('State', new GLib.Variant('u', values.State));
        if (values.IsPresent !== undefined) upower.emit_property_changed('IsPresent', new GLib.Variant('b', values.IsPresent));
    }

    beforeEach(() => {
        Object.assign(device, {IsPresent: true, Percentage: 57.6, State: 1});
        bus = new PrivateBus();
        client = bus.connect();
        service = bus.connect();
        upower = bus.serve(service, path, loadInterfaceXML('org.freedesktop.UPower.Device'), device);
        bus.own(service, 'org.freedesktop.UPower');
    });

    afterEach(() => {
        for (const created of monitors.splice(0)) created.destroy();
        bus.destroy();
    });

    it('lê a porcentagem arredondada e se está carregando', async () => {
        const battery = monitor();
        await waitFor(battery, () => battery.battery !== null);
        expect(battery.battery).toEqual({percent: 58, charging: true});
    });

    it('acompanha a mudança das propriedades do UPower', async () => {
        const battery = monitor();
        await waitFor(battery, () => battery.battery !== null);
        change({State: 2, Percentage: 41});
        await waitFor(battery, () => battery.battery?.percent === 41);
        expect(battery.battery).toEqual({percent: 41, charging: false});
    });

    it('não emite quando mudam propriedades mas não a porcentagem nem o carregamento', async () => {
        const battery = monitor();
        await waitFor(battery, () => battery.battery !== null);
        const changed = jasmine.createSpy('changed');
        battery.on('changed', changed);
        change({Percentage: 57.8});
        await settle(100);
        expect(changed).not.toHaveBeenCalled();
        change({Percentage: 40});
        await waitFor(battery, () => battery.battery?.percent === 40);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('fica sem bateria quando o dispositivo não está presente', async () => {
        const battery = monitor();
        await waitFor(battery, () => battery.battery !== null);
        change({IsPresent: false});
        await waitFor(battery, () => battery.battery === null);
        expect(battery.battery).toBeNull();
    });

    it('sem UPower no barramento avisa e fica sem bateria', async () => {
        bus.release(service, 'org.freedesktop.UPower');
        const battery = monitor();
        let changed = false;
        battery.on('changed', () => (changed = true));
        await waitFor(battery, () => changed);
        expect(battery.battery).toBeNull();
    });

    it('para de acompanhar o UPower ao ser destruído', async () => {
        const battery = new BatteryMonitor(client);
        await waitFor(battery, () => battery.battery !== null);
        battery.destroy();
        change({Percentage: 12});
        const probe = monitor();
        await waitFor(probe, () => probe.battery?.percent === 12);
        expect(battery.battery?.percent).toBe(58);
    });
});
