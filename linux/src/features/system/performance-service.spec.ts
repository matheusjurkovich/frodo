import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {PerformanceMonitor} from './performance-service.js';
import {SAMPLE_SECONDS} from './performance-service.const.js';
import {Timer} from '../../shared/timer.js';
import {settle, waitFor} from '../../../tests/fixtures.js';
import {appsByPid, fakeApp} from '../../../tests/shell/Shell.js';

describe('PerformanceMonitor', () => {
    const self = new Gio.Credentials().get_unix_pid();
    const monitors: PerformanceMonitor[] = [];
    let every: jasmine.Spy<Timer['every']>;

    function create(): PerformanceMonitor {
        const monitor = new PerformanceMonitor();
        monitors.push(monitor);
        return monitor;
    }

    async function sampled(monitor: PerformanceMonitor): Promise<void> {
        let changed = false;
        const off = monitor.on('changed', () => (changed = true));
        await waitFor(monitor, () => changed, 5000);
        off();
    }

    beforeEach(() => {
        every = spyOn(Timer.prototype, 'every').and.callThrough();
    });

    afterEach(() => {
        for (const monitor of monitors.splice(0)) monitor.destroy();
        appsByPid.clear();
    });

    it('amostra CPU, memória, disco e processos ao começar', async () => {
        appsByPid.set(self, fakeApp('Frodo'));
        const monitor = create();
        monitor.start();
        expect(every).toHaveBeenCalledOnceWith(SAMPLE_SECONDS, jasmine.any(Function));
        await sampled(monitor);
        const snapshot = monitor.snapshot;
        expect(snapshot?.cpu.cores).toBeGreaterThan(0);
        expect(snapshot?.cpu.usage).toBe(0);
        expect(snapshot?.cpuHistory).toEqual([]);
        expect(snapshot?.memory?.totalKb).toBeGreaterThan(0);
        expect(snapshot?.disk?.totalBytes).toBeGreaterThan(0);
        const own = snapshot?.processes.find(process => process.pid === self);
        expect(own?.ramBytes).toBeGreaterThan(0);
        expect(own?.protected).toBeFalse();
        expect(own && monitor.describe(own).name).toBe('Frodo');
        expect(own && monitor.describe(own).gicon).toEqual(jasmine.objectContaining({name: 'Frodo'}));
    });

    it('a cada amostra seguinte acumula o histórico de CPU', async () => {
        const monitor = create();
        monitor.start();
        await sampled(monitor);
        const tick = every.calls.mostRecent().args[1];
        tick();
        await sampled(monitor);
        tick();
        await sampled(monitor);
        expect(monitor.snapshot?.cpuHistory.length).toBe(2);
    });

    it('parar zera o histórico e não amostra mais até religar', async () => {
        const monitor = create();
        monitor.start();
        await sampled(monitor);
        const tick = every.calls.mostRecent().args[1];
        tick();
        await sampled(monitor);
        monitor.stop();
        expect(monitor.snapshot).toBeNull();
        const changed = jasmine.createSpy('changed');
        monitor.on('changed', changed);
        tick();
        await settle(50);
        expect(changed).not.toHaveBeenCalled();
        monitor.start();
        await sampled(monitor);
        expect(monitor.snapshot?.cpuHistory).toEqual([]);
    });

    it('religar sem parar não duplica o timer', () => {
        const monitor = create();
        monitor.start();
        monitor.start();
        expect(every).toHaveBeenCalledTimes(1);
    });

    it('só para de amostrar quando todo mundo que pediu parou', async () => {
        const monitor = create();
        monitor.start();
        monitor.start();
        monitor.stop();
        await sampled(monitor);
        expect(monitor.snapshot).not.toBeNull();
        monitor.stop();
        expect(monitor.snapshot).toBeNull();
    });

    it('parar e começar de novo logo em seguida volta a amostrar', async () => {
        const monitor = create();
        monitor.start();
        monitor.stop();
        monitor.start();
        await sampled(monitor);
        expect(monitor.snapshot).not.toBeNull();
    });

    it('descarta a amostra em andamento quando é destruído', async () => {
        const monitor = create();
        const other = create();
        monitor.start();
        other.start();
        monitor.destroy();
        await sampled(other);
        await settle(50);
        expect(monitor.snapshot).toBeNull();
        monitor.start();
        expect(every).toHaveBeenCalledTimes(2);
    });

    it('encerra o processo pedido e diz se conseguiu', async () => {
        const child = Gio.Subprocess.new(['sleep', '30'], Gio.SubprocessFlags.NONE);
        const pid = Number(child.get_identifier());
        expect(await create().kill(pid)).toBeTrue();
        child.wait(null);
        expect(child.get_if_signaled()).toBeTrue();
        const pidMax = Number(new TextDecoder().decode(GLib.file_get_contents('/proc/sys/kernel/pid_max')[1]).trim());
        expect(await create().kill(pidMax)).toBeFalse();
    });
});
