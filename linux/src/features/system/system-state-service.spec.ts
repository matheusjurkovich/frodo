import type Gio from 'gi://Gio';

import {BatteryMonitor} from './battery-service.js';
import {SystemState} from './system-state-service.js';
import type {SystemStateEvents} from './system-state-service.types.js';
import {ALERT_SECONDS, MEMORY_SECONDS} from './system-state-service.const.js';
import {Timer} from '../../shared/timer.js';
import {PrivateBus, settle} from '../../../tests/fixtures.js';
import {loadInterfaceXML} from '../../../tests/shell/fileUtils.js';

function next(state: SystemState, event: keyof SystemStateEvents): Promise<void> {
    return new Promise(resolve => {
        const off = state.on(event, () => {
            off();
            resolve();
        });
    });
}

describe('SystemState', () => {
    let bus: PrivateBus;
    let client: Gio.DBusConnection;
    let state: SystemState | null = null;

    beforeEach(() => {
        bus = new PrivateBus();
        client = bus.connect();
        const service = bus.connect();
        const device = {IsPresent: true, Percentage: 80, State: 2};
        bus.serve(service, '/org/freedesktop/UPower/devices/DisplayDevice', loadInterfaceXML('org.freedesktop.UPower.Device'), device);
        bus.own(service, 'org.freedesktop.UPower');
    });

    afterEach(() => {
        state?.destroy();
        state = null;
        bus.destroy();
    });

    it('repassa a bateria do monitor como evento battery', async () => {
        state = new SystemState(new BatteryMonitor(client));
        await next(state, 'battery');
        expect(state.battery).toEqual({percent: 80, charging: false});
    });

    it('lê a memória assim que é pedida e emite memory', async () => {
        state = new SystemState(new BatteryMonitor(client));
        expect(state.memory).toBeNull();
        const read = next(state, 'memory');
        state.setMemoryWanted(true);
        await read;
        expect(state.memory?.totalKb).toBeGreaterThan(0);
    });

    it('lê devagar para o alerta e só acelera enquanto a memória é pedida', () => {
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        state = new SystemState(new BatteryMonitor(client));
        expect(every).toHaveBeenCalledOnceWith(ALERT_SECONDS, jasmine.any(Function));
        state.setMemoryWanted(true);
        state.setMemoryWanted(true);
        expect(every.calls.allArgs().map(([seconds]) => seconds)).toEqual([ALERT_SECONDS, MEMORY_SECONDS]);
        state.setMemoryWanted(false);
        state.setMemoryWanted(false);
        expect(every.calls.allArgs().map(([seconds]) => seconds)).toEqual([ALERT_SECONDS, MEMORY_SECONDS, ALERT_SECONDS]);
    });

    it('descarta a leitura em voo quando a memória deixa de ser pedida', async () => {
        state = new SystemState(new BatteryMonitor(client));
        const emitted = jasmine.createSpy('memory');
        state.on('memory', emitted);
        state.setMemoryWanted(true);
        state.setMemoryWanted(false);
        await settle(100);
        expect(emitted).not.toHaveBeenCalled();
        expect(state.memory).toBeNull();
    });

    it('destrói o monitor de bateria e descarta leitura de memória pendente', async () => {
        const battery = new BatteryMonitor(client);
        const destroy = spyOn(battery, 'destroy').and.callThrough();
        state = new SystemState(battery);
        state.setMemoryWanted(true);
        state.destroy();
        expect(destroy).toHaveBeenCalled();
        await settle(50);
        expect(state.memory).toBeNull();
        state = null;
    });
});
